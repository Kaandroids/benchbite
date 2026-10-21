-- Saves the whole onboarding in one transaction: the profile, the goal, the starting weight, the
-- health data consent and the workout plan. If anything fails, nothing is saved, so a retry
-- starts from a clean state. It runs with the caller's rights, so row level security applies.
--
-- `answers` uses the app's draft fields (camelCase, metric units); `plan` is the response of the
-- generate-plan Edge Function.
create function public.complete_onboarding(answers jsonb, plan jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  caller_id uuid := (select auth.uid());
  goal public.goal_kind := (answers ->> 'goal')::public.goal_kind;
  birth_year integer := (answers ->> 'birthYear')::integer;
  training_days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(answers -> 'trainingDays')
  );
  new_plan_id uuid;
  session jsonb;
  new_session_id bigint;
  exercise jsonb;
  exercise_position integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.user_id = caller_id and p.onboarding_completed_at is not null
  ) then
    raise exception 'The onboarding is already completed';
  end if;

  -- The app checks these too; the server must not rely on it.
  if extract(year from current_date)::integer - birth_year < 18 then
    raise exception 'Benchbite is for people aged 18 and over';
  end if;
  if coalesce(answers ->> 'consentedPolicyVersion', '') = '' then
    raise exception 'Health data consent is required';
  end if;
  if (
    select array_agg(distinct (s ->> 'weekday')::smallint order by (s ->> 'weekday')::smallint)
    from jsonb_array_elements(plan -> 'sessions') s
  ) is distinct from (select array_agg(d order by d) from unnest(training_days) d) then
    raise exception 'The plan does not match the training days';
  end if;

  insert into public.profiles (
    user_id, sex, birth_year, height_cm, weight_unit, height_unit, activity_level, experience,
    training_setup, training_days, session_minutes
  )
  values (
    caller_id,
    (answers ->> 'sex')::public.sex,
    birth_year,
    (answers ->> 'heightCm')::numeric,
    (answers ->> 'weightUnit')::public.weight_unit,
    (answers ->> 'heightUnit')::public.height_unit,
    (answers ->> 'activityLevel')::public.activity_level,
    (answers ->> 'experience')::public.experience,
    (answers ->> 'setup')::public.training_setup,
    training_days,
    (answers ->> 'sessionMinutes')::smallint
  )
  -- A profile written directly, without completing the onboarding, is replaced.
  on conflict on constraint profiles_pkey do update set
    sex = excluded.sex,
    birth_year = excluded.birth_year,
    height_cm = excluded.height_cm,
    weight_unit = excluded.weight_unit,
    height_unit = excluded.height_unit,
    activity_level = excluded.activity_level,
    experience = excluded.experience,
    training_setup = excluded.training_setup,
    training_days = excluded.training_days,
    session_minutes = excluded.session_minutes;

  -- Only goals that change the weight keep a target weight and a pace.
  insert into public.goals (user_id, kind, target_weight_kg, weekly_pace_kg)
  values (
    caller_id,
    goal,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'targetWeightKg')::numeric end,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'weeklyPaceKg')::numeric end
  )
  on conflict on constraint goals_pkey do update set
    kind = excluded.kind,
    target_weight_kg = excluded.target_weight_kg,
    weekly_pace_kg = excluded.weekly_pace_kg;

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

    exercise_position := 0;
    for exercise in
      select value from jsonb_array_elements(session -> 'exercises')
      union all
      select session -> 'finisher' where jsonb_typeof(session -> 'finisher') = 'object'
    loop
      insert into public.plan_exercises (
        session_id, user_id, position, exercise_id, slot, sets, target_reps_min,
        target_reps_max, target_seconds, rest_seconds, is_finisher
      )
      values (
        new_session_id,
        caller_id,
        exercise_position,
        exercise ->> 'exerciseId',
        (exercise ->> 'slot')::public.plan_slot,
        (exercise ->> 'sets')::smallint,
        (exercise #>> '{target,reps,min}')::smallint,
        (exercise #>> '{target,reps,max}')::smallint,
        (exercise #>> '{target,seconds}')::smallint,
        (exercise ->> 'restSeconds')::smallint,
        exercise = session -> 'finisher'
      );
      exercise_position := exercise_position + 1;
    end loop;
  end loop;

  update public.profiles p set onboarding_completed_at = now()
  where p.user_id = caller_id;
end;
$$;

revoke execute on function public.complete_onboarding from public, anon;
grant execute on function public.complete_onboarding to authenticated;
