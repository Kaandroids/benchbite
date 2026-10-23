-- What an exercise records, and the targets workouts keep for it, stay in step (#113, codebase
-- review):
--
-- - edit_exercise() refuses to change what a custom exercise records while a workout has it, as it
--   already does once it is logged. The workout's target would no longer suit it, so the workout
--   could not be saved, and its log would refuse the sets it starts with.
-- - complete_onboarding() checks each target against its exercise, as save_workout() does, and
--   refuses a session without exercises. The plan comes from the app, which builds valid plans,
--   but the server must not rely on that.
--
-- Errors:
--   BB018  what an exercise records cannot change while a workout has it

-- Unchanged apart from the check against workouts.
create or replace function public.edit_exercise(exercise_id text, exercise jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_metrics public.exercise_metric[];
  fields record;
begin
  select x.metrics into current_metrics
  from public.exercises x
  where x.id = edit_exercise.exercise_id and x.owner_id = caller_id
  for update;
  if not found then
    raise exception 'Exercise not found' using errcode = 'BB015';
  end if;
  select * into fields from public.custom_exercise_fields(exercise);
  if fields.metrics <> current_metrics and exists (
    select 1 from public.logged_sets s where s.exercise_id = edit_exercise.exercise_id
  ) then
    raise exception 'What the exercise records cannot change once it is logged'
      using errcode = 'BB016';
  end if;
  -- A workout keeps a target that suits what the exercise records, archived workouts too.
  if fields.metrics <> current_metrics and exists (
    select 1 from public.workout_exercises w where w.exercise_id = edit_exercise.exercise_id
  ) then
    raise exception 'What the exercise records cannot change while a workout has it'
      using errcode = 'BB018';
  end if;
  update public.exercises x set
    name = fields.name,
    level = fields.level,
    category =
      (case when 'distance' = any(fields.metrics) then 'cardio' else 'strength' end)::public.exercise_category,
    equipment = fields.equipment,
    primary_muscles = fields.primary_muscles,
    secondary_muscles = fields.secondary_muscles,
    instructions = fields.instructions,
    image_paths = fields.image_paths,
    metrics = fields.metrics
  where x.id = edit_exercise.exercise_id;
end;
$$;

-- Unchanged apart from the session sizes and the targets.
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
  -- The plan builder never fills a session with more than about ten exercises, nor leaves one
  -- empty.
  if exists (
    select 1 from jsonb_array_elements(plan -> 'sessions') s
    where coalesce(jsonb_array_length(s -> 'exercises'), 0) not between 1 and 12
  ) then
    raise exception 'A session needs 1 to 12 exercises' using errcode = 'BB005';
  end if;
  -- Each target suits what its exercise records, as save_workout() checks; a workout would
  -- otherwise start with sets that its log refuses. Unknown exercises are left to the foreign key.
  if exists (
    select 1
    from jsonb_array_elements(plan -> 'sessions') s,
      jsonb_array_elements(s -> 'exercises') e
    join public.exercises x on x.id = e.value ->> 'exerciseId'
    where not public.target_suits(x.metrics, e.value -> 'target')
  ) then
    raise exception 'A target does not suit its exercise' using errcode = 'BB007';
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

    -- The exercises in order; conditioning for fat loss is the last of them.
    insert into public.workout_exercises (
      workout_id, user_id, position, exercise_id, slot, sets, target_reps_min, target_reps_max,
      target_seconds, rest_seconds
    )
    select
      new_workout_id,
      caller_id,
      (e.ordinality - 1)::smallint,
      e.value ->> 'exerciseId',
      (e.value ->> 'slot')::public.plan_slot,
      (e.value ->> 'sets')::smallint,
      (e.value #>> '{target,reps,min}')::smallint,
      (e.value #>> '{target,reps,max}')::smallint,
      (e.value #>> '{target,seconds}')::smallint,
      (e.value ->> 'restSeconds')::smallint
    from jsonb_array_elements(session -> 'exercises') with ordinality e;
  end loop;
end;
$$;
