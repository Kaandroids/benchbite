-- A finished workout can be corrected afterwards (#34, ADR 0023): edit_workout_log() replaces all
-- the sets of a log at once, checked like log_workout() checks them. When the workout was done,
-- what it had when it started and the calories it burned stay as they were.
--
-- Errors the app needs to tell apart have their own SQLSTATE codes:
--   BB013  the log does not exist, or is not the caller's

-- Checks the sets of a log as log_workout() and edit_workout_log() take them, in one pass: a log
-- needs at least one set, and each set must suit what its exercise records. Unknown exercises are
-- left to the foreign key.
create function public.check_sets(log jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  set_count integer;
  unsuited boolean;
begin
  select count(*),
    coalesce(
      bool_or(not public.set_suits(x.metrics, s.weight_kg, s.reps, s.seconds, s.meters)), false
    )
  into set_count, unsuited
  from public.sets_of(log) s
  left join public.exercises x on x.id = s.exercise_id;

  if set_count = 0 then
    raise exception 'A log needs at least one set' using errcode = 'BB010';
  end if;
  if unsuited then
    raise exception 'A set does not suit its exercise' using errcode = 'BB011';
  end if;
end;
$$;

revoke execute on function public.check_sets from public, anon, authenticated;

-- Replaces the sets of one of the caller's logs, in log_workout()'s shape:
--   {"exercises": [{"exerciseId": "Pushups", "sets": [{"weightKg": null, "reps": 12}]}]}
-- Exercises without sets save nothing but keep their places, so that a skipped exercise can get
-- sets later. A log keeps at least one set: one without any is deleted instead.
create function public.edit_workout_log(log_id bigint, log jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.workout_logs l
    where l.id = edit_workout_log.log_id and l.user_id = caller_id
  ) then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;

  perform public.check_sets(log);

  delete from public.logged_sets s where s.log_id = edit_workout_log.log_id;
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters
  )
  select edit_workout_log.log_id, caller_id, s.exercise_position, s.set_position, s.exercise_id,
    s.weight_kg, s.reps, s.seconds, s.meters
  from public.sets_of(log) s;
end;
$$;

revoke execute on function public.edit_workout_log from public, anon;
grant execute on function public.edit_workout_log to authenticated;

-- Unchanged apart from checking the sets with check_sets().
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
