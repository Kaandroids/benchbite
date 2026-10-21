-- The onboarding's data is written only by complete_onboarding(), so that its checks cannot be
-- skipped by writing to the tables directly. Before, the function ran with the caller's rights,
-- so the tables had to accept the same writes from anyone signed in, including a profile that
-- claims to be finished without consent. Now the function runs with its owner's rights, and users
-- may only change what settings will let them change. Rules that must hold however a row is
-- written, such as the minimum age, are enforced on the tables themselves.
--
-- Errors the app needs to tell apart have their own SQLSTATE codes:
--   BB001  the onboarding is already completed
--   BB002  the user is younger than 18
--   BB003  health data consent is missing
--   BB004  the plan does not match the training days
--   BB005  a session of the plan has too many exercises

-- Ages are counted from the birth year alone, as the onboarding only asks for the year.
create function public.age_in_years(birth_year integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from current_date)::integer - birth_year;
$$;

create function public.check_minimum_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.age_in_years(new.birth_year) < 18 then
    raise exception 'Benchbite is for people aged 18 and over' using errcode = 'BB002';
  end if;
  return new;
end;
$$;

create trigger profiles_minimum_age
  before insert or update of birth_year on public.profiles
  for each row execute function public.check_minimum_age();

-- A check constraint cannot use a subquery, so it calls this function instead.
create function public.has_no_duplicates(items smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select count(distinct item) = count(*) from unnest(items) item;
$$;

alter table public.profiles drop constraint profiles_training_days_check;
alter table public.profiles add constraint profiles_training_days_check check (
  cardinality(training_days) between 1 and 6
  and training_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  and public.has_no_duplicates(training_days)
);

-- Policy versions are dates such as 2026-10-21; the limit only keeps out nonsense.
alter table public.health_data_consents add constraint health_data_consents_policy_version_check
  check (length(policy_version) between 1 and 32);

-- Profiles and goals are created by the onboarding only. Afterwards, users can change their
-- answers, but not when or whether they finished the onboarding.
drop policy "Users create their own profile" on public.profiles;
drop policy "Users create their own goal" on public.goals;
revoke insert, update on public.profiles, public.goals from authenticated;
grant update (
  sex, birth_year, height_cm, weight_unit, height_unit, activity_level, experience,
  training_setup, training_days, session_minutes
) on public.profiles to authenticated;
grant update (kind, target_weight_kg, weekly_pace_kg) on public.goals to authenticated;

-- Plans are created by the onboarding only and are read-only for now. A deleted plan could not be
-- built again, as the onboarding cannot be repeated.
drop policy "Users create their own plan" on public.workout_plans;
drop policy "Users delete their own plan" on public.workout_plans;
drop policy "Users create their own plan sessions" on public.plan_sessions;
drop policy "Users create their own plan exercises" on public.plan_exercises;
revoke insert, delete on public.workout_plans, public.plan_sessions, public.plan_exercises
  from authenticated;

-- Runs with its owner's rights, which bypass row level security. Every row it writes belongs to
-- the caller, whose id comes from the token, never from the arguments.
create or replace function public.complete_onboarding(answers jsonb, plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  caller_id uuid := (select auth.uid());
  goal public.goal_kind := (answers ->> 'goal')::public.goal_kind;
  training_days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(answers -> 'trainingDays')
  );
  new_plan_id uuid;
  session jsonb;
  new_session_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.user_id = caller_id and p.onboarding_completed_at is not null
  ) then
    raise exception 'The onboarding is already completed' using errcode = 'BB001';
  end if;

  -- The app checks these too; the server must not rely on it. The minimum age is checked by the
  -- profiles table.
  if coalesce(answers ->> 'consentedPolicyVersion', '') = '' then
    raise exception 'Health data consent is required' using errcode = 'BB003';
  end if;
  if (
    select array_agg(distinct (s ->> 'weekday')::smallint order by (s ->> 'weekday')::smallint)
    from jsonb_array_elements(plan -> 'sessions') s
  ) is distinct from (select array_agg(d order by d) from unnest(training_days) d) then
    raise exception 'The plan does not match the training days' using errcode = 'BB004';
  end if;
  -- The plan builder never fills a session with more than about ten exercises.
  if exists (
    select 1 from jsonb_array_elements(plan -> 'sessions') s
    where jsonb_array_length(s -> 'exercises') > 12
  ) then
    raise exception 'A session has too many exercises' using errcode = 'BB005';
  end if;

  insert into public.profiles (
    user_id, sex, birth_year, height_cm, weight_unit, height_unit, activity_level, experience,
    training_setup, training_days, session_minutes, onboarding_completed_at
  )
  values (
    caller_id,
    (answers ->> 'sex')::public.sex,
    (answers ->> 'birthYear')::integer,
    (answers ->> 'heightCm')::numeric,
    (answers ->> 'weightUnit')::public.weight_unit,
    (answers ->> 'heightUnit')::public.height_unit,
    (answers ->> 'activityLevel')::public.activity_level,
    (answers ->> 'experience')::public.experience,
    (answers ->> 'setup')::public.training_setup,
    training_days,
    (answers ->> 'sessionMinutes')::smallint,
    now()
  );

  -- Only goals that change the weight keep a target weight and a pace.
  insert into public.goals (user_id, kind, target_weight_kg, weekly_pace_kg)
  values (
    caller_id,
    goal,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'targetWeightKg')::numeric end,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'weeklyPaceKg')::numeric end
  );

  insert into public.weight_entries (user_id, weight_kg)
  values (caller_id, (answers ->> 'weightKg')::numeric);

  insert into public.health_data_consents (user_id, policy_version)
  values (caller_id, answers ->> 'consentedPolicyVersion');

  insert into public.workout_plans (user_id) values (caller_id) returning id into new_plan_id;

  for session in select value from jsonb_array_elements(plan -> 'sessions') loop
    insert into public.plan_sessions (plan_id, user_id, weekday, type, estimated_minutes)
    values (
      new_plan_id,
      caller_id,
      (session ->> 'weekday')::smallint,
      (session ->> 'type')::public.plan_session_type,
      (session ->> 'estimatedMinutes')::smallint
    )
    returning id into new_session_id;

    -- The exercises in order, then the finisher, if there is one.
    insert into public.plan_exercises (
      session_id, user_id, position, exercise_id, slot, sets, target_reps_min, target_reps_max,
      target_seconds, rest_seconds, is_finisher
    )
    select
      new_session_id,
      caller_id,
      (row_number() over (order by e.is_finisher, e.ordinality) - 1)::smallint,
      e.exercise ->> 'exerciseId',
      (e.exercise ->> 'slot')::public.plan_slot,
      (e.exercise ->> 'sets')::smallint,
      (e.exercise #>> '{target,reps,min}')::smallint,
      (e.exercise #>> '{target,reps,max}')::smallint,
      (e.exercise #>> '{target,seconds}')::smallint,
      (e.exercise ->> 'restSeconds')::smallint,
      e.is_finisher
    from (
      select value as exercise, ordinality, false as is_finisher
      from jsonb_array_elements(session -> 'exercises') with ordinality
      union all
      select session -> 'finisher', 1, true
      where jsonb_typeof(session -> 'finisher') = 'object'
    ) e;
  end loop;
end;
$$;
