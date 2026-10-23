-- A log also keeps which exercises the workout had when it was started, in their order, so that
-- an exercise skipped then can be named when the log is edited later, however the workout has
-- changed since (ADR 0023). Logs saved before have none.
alter table public.workout_logs
  add column planned_exercise_ids text[]
    check (cardinality(planned_exercise_ids) between 1 and 50)
    check (array_position(planned_exercise_ids, null) is null);

-- Unchanged apart from keeping the exercises' ids, which the log brings in their order, those
-- without sets too.
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

  perform public.check_sets(log);

  insert into public.workout_logs (
    user_id, workout_id, name, type, started_at, finished_at, planned_exercises, planned_sets,
    planned_exercise_ids, estimated_kcal
  )
  values (
    caller_id, source_id, source.name, source.type, started, finished,
    (log ->> 'plannedExercises')::smallint, (log ->> 'plannedSets')::smallint,
    (
      select array_agg(e.value ->> 'exerciseId' order by e.ordinality)
      from jsonb_array_elements(log -> 'exercises') with ordinality e
    ),
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

-- Unchanged apart from the planned exercises' ids, added at the end.
create or replace view public.workout_log_summaries
with (security_invoker = true)
as
select
  l.id,
  l.workout_id,
  l.name,
  l.type,
  l.started_at,
  l.finished_at,
  s.exercises,
  l.planned_exercises,
  s.sets,
  l.planned_sets,
  s.kilograms,
  l.estimated_kcal,
  l.planned_exercise_ids
from public.workout_logs l
cross join lateral (
  select
    count(distinct t.exercise_position)::integer as exercises,
    count(*)::integer as sets,
    coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
  from public.logged_sets t
  where t.log_id = l.id
) s;
