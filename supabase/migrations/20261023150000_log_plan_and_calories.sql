-- A log also keeps what the workout had when it was started, so that the history can say how
-- much of it was done (7 of 8 exercises), and the calories it burned, estimated when it is saved
-- so that the history never changes afterwards (ADR 0021). Logs saved before have neither.

alter table public.workout_logs
  add column planned_exercises smallint check (planned_exercises between 1 and 50),
  add column planned_sets smallint check (planned_sets between 1 and 1000),
  add column estimated_kcal integer check (estimated_kcal >= 0);

-- Calories burned in a minute of strength training: 5 METs, a kilocalorie per kilogram of body
-- weight and hour for each MET.
create function public.strength_kcal_per_minute(weight_kg numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 5.0 * weight_kg / 60;
$$;

-- The same for the caller at their latest weight, for estimating planned workouts; null without a
-- weight.
create function public.my_strength_kcal_per_minute()
returns numeric
language sql
stable
set search_path = ''
as $$
  select public.strength_kcal_per_minute(e.weight_kg)
  from public.weight_entries e
  where e.user_id = (select auth.uid())
  order by e.measured_on desc
  limit 1;
$$;

revoke execute on function public.my_strength_kcal_per_minute from public, anon;
grant execute on function public.my_strength_kcal_per_minute to authenticated;

-- Unchanged apart from saving "plannedExercises" and "plannedSets", which are optional, and the
-- estimate of the calories.
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
    user_id, workout_id, name, type, started_at, finished_at, planned_exercises, planned_sets,
    estimated_kcal
  )
  values (
    caller_id, source_id, source.name, source.type, started, finished,
    (log ->> 'plannedExercises')::smallint, (log ->> 'plannedSets')::smallint,
    round(
      public.my_strength_kcal_per_minute() * extract(epoch from finished - started) / 60
    )::integer
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
