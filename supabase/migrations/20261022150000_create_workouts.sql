-- Workouts replace the single weekly plan (ADR 0016). A workout is one session, such as "Pull",
-- assigned to any number of weekdays, none included. Several workouts can be active at once; the
-- active ones make up the user's week, and inactive ones are kept in an archive.
--
-- The plan's tables are renamed rather than copied, so existing rows and their ids are kept: each
-- session of a plan becomes an active workout on its weekday.

alter type public.plan_session_type rename to workout_type;

alter table public.plan_sessions rename to workouts;
alter table public.workouts rename constraint plan_sessions_pkey to workouts_pkey;
alter table public.workouts rename constraint plan_sessions_user_id_fkey to workouts_user_id_fkey;
alter table public.workouts
  rename constraint plan_sessions_estimated_minutes_check to workouts_estimated_minutes_check;

alter table public.workouts
  add column weekdays smallint[] not null default '{}',
  add column active boolean not null default true,
  add column created_at timestamptz not null default now();
update public.workouts w
set weekdays = array[w.weekday], created_at = p.created_at
from public.workout_plans p
where p.id = w.plan_id;
alter table public.workouts
  drop column weekday,
  drop column plan_id,
  add constraint workouts_weekdays_check check (
    weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and public.has_no_duplicates(weekdays)
  );

drop index if exists public.plan_sessions_plan_id_idx;
create index workouts_user_id_idx on public.workouts (user_id);

alter table public.plan_exercises rename to workout_exercises;
alter table public.workout_exercises rename column session_id to workout_id;
alter table public.workout_exercises
  rename constraint plan_exercises_pkey to workout_exercises_pkey;
alter table public.workout_exercises
  rename constraint plan_exercises_session_id_fkey to workout_exercises_workout_id_fkey;
alter table public.workout_exercises
  rename constraint plan_exercises_user_id_fkey to workout_exercises_user_id_fkey;
alter table public.workout_exercises
  rename constraint plan_exercises_exercise_id_fkey to workout_exercises_exercise_id_fkey;
alter table public.workout_exercises
  rename constraint plan_exercises_session_id_position_key to workout_exercises_workout_id_position_key;
alter index public.plan_exercises_session_id_idx rename to workout_exercises_workout_id_idx;
alter table public.workout_exercises rename constraint plan_exercises_check to workout_exercises_check;
alter table public.workout_exercises
  rename constraint plan_exercises_position_check to workout_exercises_position_check;
alter table public.workout_exercises
  rename constraint plan_exercises_sets_check to workout_exercises_sets_check;
alter table public.workout_exercises
  rename constraint plan_exercises_rest_seconds_check to workout_exercises_rest_seconds_check;
alter table public.workout_exercises
  rename constraint plan_exercises_target_reps_min_check to workout_exercises_target_reps_min_check;
alter table public.workout_exercises
  rename constraint plan_exercises_target_reps_max_check to workout_exercises_target_reps_max_check;
alter table public.workout_exercises
  rename constraint plan_exercises_target_seconds_check to workout_exercises_target_seconds_check;
alter sequence public.plan_sessions_id_seq rename to workouts_id_seq;
alter sequence public.plan_exercises_id_seq rename to workout_exercises_id_seq;

drop table public.workout_plans;

alter policy "Users read their own plan sessions" on public.workouts
  rename to "Users read their own workouts";
alter policy "Users read their own plan exercises" on public.workout_exercises
  rename to "Users read their own workout exercises";

-- Users switch their workouts on and off. Editing the rest of a workout comes with creating
-- workouts (#72).
create policy "Users update their own workouts"
  on public.workouts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant update (active) on public.workouts to authenticated;

-- The onboarding saves each session of the generated plan as an active workout on its weekday.
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
  session jsonb;
  new_workout_id bigint;
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

  for session in select value from jsonb_array_elements(plan -> 'sessions') loop
    insert into public.workouts (user_id, weekdays, type, estimated_minutes)
    values (
      caller_id,
      array[(session ->> 'weekday')::smallint],
      (session ->> 'type')::public.workout_type,
      (session ->> 'estimatedMinutes')::smallint
    )
    returning id into new_workout_id;

    -- The exercises in order, then the finisher, if there is one.
    insert into public.workout_exercises (
      workout_id, user_id, position, exercise_id, slot, sets, target_reps_min, target_reps_max,
      target_seconds, rest_seconds, is_finisher
    )
    select
      new_workout_id,
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
