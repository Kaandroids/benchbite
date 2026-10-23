-- A log also keeps how many exercises and sets the workout had when it was started, so that the
-- history can say how much of it was done, such as 7 of 8 exercises. Logs saved before have none.

alter table public.workout_logs
  add column planned_exercises smallint check (planned_exercises between 1 and 50),
  add column planned_sets smallint check (planned_sets between 1 and 1000);

-- Unchanged apart from saving "plannedExercises" and "plannedSets", which are optional.
create or replace function public.log_workout(log jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_id bigint := (log ->> 'workoutId')::bigint;
  started timestamptz := (log ->> 'startedAt')::timestamptz;
  finished timestamptz := (log ->> 'finishedAt')::timestamptz;
  source public.workouts;
  new_log_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if started is null or finished is null or finished <= started
    or finished - started > interval '12 hours' or finished > now() + interval '5 minutes' then
    raise exception 'The workout''s start and end do not make sense' using errcode = 'BB012';
  end if;

  select * into source from public.workouts w where w.id = source_id and w.user_id = caller_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;

  if not exists (select 1 from public.sets_of(log)) then
    raise exception 'A log needs at least one set' using errcode = 'BB010';
  end if;
  -- Unknown exercises are left to the foreign key.
  if exists (
    select 1 from public.sets_of(log) s join public.exercises x on x.id = s.exercise_id
    where not public.set_suits(x.metrics, s.weight_kg, s.reps, s.seconds, s.meters)
  ) then
    raise exception 'A set does not suit its exercise' using errcode = 'BB011';
  end if;

  insert into public.workout_logs (
    user_id, workout_id, name, type, started_at, finished_at, planned_exercises, planned_sets
  )
  values (
    caller_id, source_id, source.name, source.type, started, finished,
    (log ->> 'plannedExercises')::smallint, (log ->> 'plannedSets')::smallint
  )
  returning id into new_log_id;

  -- Exercises without sets leave gaps in the positions, which keep the workout's order.
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters
  )
  select new_log_id, caller_id, exercise_position, set_position, exercise_id, weight_kg, reps,
    seconds, meters
  from public.sets_of(log);

  return new_log_id;
end;
$$;
