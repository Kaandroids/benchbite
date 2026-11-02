-- Which target an exercise takes (#402, ADR 0076), so that Bite gives the right one the first time:
-- reps for one counted in reps, meters or seconds for a distance, seconds for the rest. It is
-- target_suits()'s rule (20261022171000_save_workout.sql): change both together. PostgREST reads it
-- as a computed field of `exercises`.
create function public.target_kind(exercise public.exercises)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when 'reps' = any(exercise.metrics) then 'reps'
    when 'distance' = any(exercise.metrics) then 'meters or seconds'
    else 'seconds'
  end;
$$;

revoke all on function public.target_kind(public.exercises) from public, anon;
grant execute on function public.target_kind(public.exercises) to authenticated;
