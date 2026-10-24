-- Closes the low-priority gaps the codebase review found in the database:
--
-- 1. Arrays of an exercise hold no null: custom_exercise_fields() refuses a null muscle (a JSON
--    null passed every check, as comparisons with null are never true), and the table checks it
--    for every array but the photos, where a null stands for a missing start.
-- 2. Limits hold for saves that arrive at once: save_workout(), create_exercise(),
--    complete_onboarding() and the photo upload policy take a lock per user before they count, so
--    two requests cannot both see room for one more. complete_onboarding() also counts the
--    workouts a guest saved before finishing it.
-- 3. archive_exercise() refuses a null archived, which brought the exercise back.
-- 4. A user's folder of exercise-photos holds two photos for each custom exercise a user may
--    have, so uploads cannot fill the storage. The exercise limit now comes from one function.
-- 5. Weight entries change only through what the app writes: the day, the user and the weight,
--    which an upsert sets again, but not when they were created. Their id is an identity column
--    that cannot be changed anyway.

-- The custom exercises a user may have, as workout_limits() does for workouts (ADR 0018).
create function public.custom_exercise_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 500;
$$;

-- Serializes the limit checks of one user until the transaction ends. Every function that counts
-- toward a limit takes it first, with the same key.
create function public.lock_user_limits(user_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('limits:' || user_id::text, 0));
$$;

revoke execute on function public.custom_exercise_limit(), public.lock_user_limits(uuid)
from public, anon, authenticated;

-- 1. The old functions let a null muscle through, so any stored ones go before the checks.
update public.exercises
set primary_muscles = array_remove(primary_muscles, null),
  secondary_muscles = array_remove(secondary_muscles, null),
  instructions = array_remove(instructions, null)
where array_position(primary_muscles, null) is not null
  or array_position(secondary_muscles, null) is not null
  or array_position(instructions, null) is not null;

alter table public.exercises
  add constraint exercises_primary_muscles_no_null check (array_position(primary_muscles, null) is null),
  add constraint exercises_secondary_muscles_no_null check (array_position(secondary_muscles, null) is null),
  add constraint exercises_metrics_no_null check (array_position(metrics, null) is null),
  add constraint exercises_instructions_no_null check (array_position(instructions, null) is null);

-- Unchanged apart from refusing a null muscle.
create or replace function public.custom_exercise_fields(exercise jsonb)
returns table (
  name text,
  metrics public.exercise_metric[],
  primary_muscles public.muscle[],
  secondary_muscles public.muscle[],
  equipment public.equipment,
  level public.exercise_level,
  instructions text[],
  image_paths text[]
)
language plpgsql
stable
set search_path = ''
as $$
begin
  begin
    name := btrim(exercise ->> 'name');
    metrics := array(select jsonb_array_elements_text(exercise -> 'metrics'))::public.exercise_metric[];
    primary_muscles := array(
      select distinct jsonb_array_elements_text(exercise -> 'primaryMuscles')
    )::public.muscle[];
    secondary_muscles := array(
      select distinct m from jsonb_array_elements_text(coalesce(exercise -> 'secondaryMuscles', '[]')) m
      where m <> all (array(select jsonb_array_elements_text(exercise -> 'primaryMuscles')))
    )::public.muscle[];
    equipment := (exercise ->> 'equipment')::public.equipment;
    level := coalesce(exercise ->> 'level', 'beginner')::public.exercise_level;
    instructions := array(
      select btrim(step) from jsonb_array_elements_text(coalesce(exercise -> 'instructions', '[]')) step
      where btrim(step) <> ''
    );
    image_paths := array(
      select jsonb_array_elements_text(coalesce(exercise -> 'imagePaths', '[]'))
    );
  exception
    when invalid_text_representation or invalid_parameter_value or wrong_object_type then
      raise exception 'The exercise is not valid' using errcode = 'BB014';
  end;
  if name is null or char_length(name) not between 1 and 80
    or not public.metrics_valid(metrics)
    or array_position(primary_muscles, null) is not null
    or array_position(secondary_muscles, null) is not null
    or cardinality(primary_muscles) not between 1 and 5
    or cardinality(secondary_muscles) > 10
    or cardinality(instructions) > 20
    or exists (select 1 from unnest(instructions) step where char_length(step) > 500)
    or cardinality(image_paths) > 2
    or exists (
      select 1 from unnest(image_paths) with ordinality p (path, position)
      where case
        when path is null then position <> 1 or cardinality(image_paths) <> 2
        else path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$')
      end
    )
  then
    raise exception 'The exercise is not valid' using errcode = 'BB014';
  end if;
  return next;
end;
$$;

-- 2. Unchanged apart from the lock, and the limit from custom_exercise_limit().
create or replace function public.save_workout(workout jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_id bigint := (workout ->> 'id')::bigint;
  items jsonb := coalesce(workout -> 'exercises', '[]');
  days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(coalesce(workout -> 'weekdays', '[]'))
  );
  max_exercises integer;
  max_workouts integer;
  minutes smallint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  perform public.lock_user_limits(caller_id);

  select l.exercises, l.workouts into max_exercises, max_workouts from public.workout_limits() l;

  if jsonb_array_length(items) not between 1 and max_exercises then
    raise exception 'A workout needs 1 to % exercises', max_exercises using errcode = 'BB008';
  end if;
  -- Workouts from the plan builder count too, archived ones as well.
  if saved_id is null
    and (select count(*) from public.workouts w where w.user_id = caller_id) >= max_workouts then
    raise exception 'A user can have up to % workouts', max_workouts using errcode = 'BB009';
  end if;
  -- Unknown exercises are left to the foreign key.
  if exists (
    select 1
    from jsonb_array_elements(items) e
    join public.exercises x on x.id = e ->> 'exerciseId'
    where not public.target_suits(x.metrics, e -> 'target')
  ) then
    raise exception 'A target does not suit its exercise' using errcode = 'BB007';
  end if;

  -- Five minutes to warm up, as in the plan builder.
  minutes := least(180, ceil((
    300 + (select sum(public.exercise_seconds(e)) from jsonb_array_elements(items) e)
  ) / 60.0));

  if saved_id is null then
    insert into public.workouts (user_id, name, weekdays, estimated_minutes)
    values (caller_id, workout ->> 'name', days, minutes)
    returning id into saved_id;
  else
    update public.workouts w
    set name = workout ->> 'name', weekdays = days, estimated_minutes = minutes
    where w.id = saved_id and w.user_id = caller_id;
    if not found then
      raise exception 'Workout not found' using errcode = 'BB006';
    end if;
    delete from public.workout_exercises where workout_id = saved_id;
  end if;

  insert into public.workout_exercises (
    workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max,
    target_seconds, target_meters, rest_seconds
  )
  select
    saved_id,
    caller_id,
    (e.ordinality - 1)::smallint,
    e.value ->> 'exerciseId',
    (e.value ->> 'sets')::smallint,
    (e.value #>> '{target,reps,min}')::smallint,
    (e.value #>> '{target,reps,max}')::smallint,
    (e.value #>> '{target,seconds}')::smallint,
    (e.value #>> '{target,meters}')::integer,
    (e.value ->> 'restSeconds')::smallint
  from jsonb_array_elements(items) with ordinality e;

  return saved_id;
end;
$$;

create or replace function public.create_exercise(exercise jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_id text := 'custom-' || gen_random_uuid();
  fields record;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits(caller_id);
  if (select count(*) from public.exercises x where x.owner_id = caller_id)
    >= public.custom_exercise_limit() then
    raise exception 'Too many custom exercises' using errcode = 'BB017';
  end if;
  select * into fields from public.custom_exercise_fields(exercise);
  insert into public.exercises (
    id, owner_id, name, level, category, equipment, primary_muscles, secondary_muscles,
    instructions, image_paths, metrics
  ) values (
    new_id, caller_id, fields.name, fields.level,
    (case when 'distance' = any(fields.metrics) then 'cardio' else 'strength' end)::public.exercise_category,
    fields.equipment, fields.primary_muscles, fields.secondary_muscles, fields.instructions,
    fields.image_paths, fields.metrics
  );
  return new_id;
end;
$$;

-- Unchanged apart from the lock and counting the workouts saved before.
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
  perform public.lock_user_limits(caller_id);
  -- Workouts a guest saved before finishing the onboarding count too.
  if jsonb_array_length(plan -> 'sessions')
    + (select count(*) from public.workouts w where w.user_id = caller_id)
    > (select l.workouts from public.workout_limits() l) then
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

-- 3. Unchanged apart from refusing a null archived.
create or replace function public.archive_exercise(exercise_id text, archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if archived is null then
    raise exception 'The exercise is not valid' using errcode = 'BB014';
  end if;
  update public.exercises x
  set archived_at = case when archived then coalesce(x.archived_at, now()) end
  where x.id = archive_exercise.exercise_id and x.owner_id = auth.uid();
  if not found then
    raise exception 'Exercise not found' using errcode = 'BB015';
  end if;
end;
$$;

-- 4. A policy of storage.objects cannot query that table itself without recursing into its own
-- policies, so the check runs as the owner. It counts only the caller's folder, by the name's
-- prefix so that the index on names is used, after taking the caller's lock.
create function public.can_upload_exercise_photo()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  perform public.lock_user_limits(caller_id);
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'exercise-photos' and o.name like caller_id::text || '/%'
  ) < 2 * public.custom_exercise_limit();
end;
$$;

revoke execute on function public.can_upload_exercise_photo() from public, anon;
grant execute on function public.can_upload_exercise_photo() to authenticated;

drop policy "Users upload their own exercise photos" on storage.objects;

create policy "Users upload their own exercise photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'exercise-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_exercise_photo()
  );

-- 5
revoke all on public.weight_entries from authenticated;
grant select on public.weight_entries to authenticated;
grant insert (user_id, measured_on, weight_kg), update (user_id, measured_on, weight_kg)
  on public.weight_entries to authenticated;
