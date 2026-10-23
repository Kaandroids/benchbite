-- Plans repeat a workout on every day of its kind instead of building one per day (ADR 0019), so
-- a plan has at most 3 workouts, which is now the free workout limit (ADR 0018). Each session of
-- the plan has weekdays instead of a weekday.

create or replace function public.workout_limits()
returns table (exercises integer, workouts integer)
language sql
stable
set search_path = ''
as $$
  select 20, 3;
$$;

-- The onboarding saves each session of the plan as an active workout on its weekdays. A plan never
-- has more workouts than the user may have.
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
  -- Every training day is in exactly one session.
  if (
    select array_agg(d.value::smallint order by d.value::smallint)
    from jsonb_array_elements(plan -> 'sessions') s,
      jsonb_array_elements_text(s -> 'weekdays') d
  ) is distinct from (select array_agg(d order by d) from unnest(training_days) d) then
    raise exception 'The plan does not match the training days' using errcode = 'BB004';
  end if;
  if jsonb_array_length(plan -> 'sessions') > (select l.workouts from public.workout_limits() l) then
    raise exception 'A user can have up to % workouts', (select l.workouts from public.workout_limits() l)
      using errcode = 'BB009';
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
      array(select value::smallint from jsonb_array_elements_text(session -> 'weekdays')),
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
