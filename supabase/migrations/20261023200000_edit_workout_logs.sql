-- A finished workout can be corrected afterwards (#34, ADR 0023): edit_workout_log() replaces all
-- the sets of a log at once, checked like log_workout() checks them. When the workout was done,
-- what it had when it started and the calories it burned stay as they were.
--
-- Errors the app needs to tell apart have their own SQLSTATE codes:
--   BB013  the log does not exist, or is not the caller's

-- Replaces the sets of one of the caller's logs, in log_workout()'s shape:
--   {"exercises": [{"exerciseId": "Pushups", "sets": [{"weightKg": null, "reps": 12}]}]}
-- Exercises without sets are left out. A log keeps at least one set: one without any is deleted
-- instead.
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
