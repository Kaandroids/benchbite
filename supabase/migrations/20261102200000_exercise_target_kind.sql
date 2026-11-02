-- Which target an exercise takes (#402, ADR 0076), so that Bite gives the right one the first time:
-- reps for one counted in reps, meters or seconds for a distance, seconds for the rest. Written
-- once, for target_suits() to check by and for PostgREST to give as a computed field of
-- `exercises`.
create function public.metric_target_kind(metrics public.exercise_metric[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when 'reps' = any(metrics) then 'reps'
    when 'distance' = any(metrics) then 'meters or seconds'
    else 'seconds'
  end;
$$;

create function public.target_kind(exercise public.exercises)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.metric_target_kind(exercise.metrics);
$$;

-- As before (20261022171000_save_workout.sql), by metric_target_kind().
create or replace function public.target_suits(
  metrics public.exercise_metric[],
  target jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with given as (
    select
      jsonb_typeof(target -> 'reps') = 'object' as reps,
      coalesce(jsonb_typeof(target -> 'seconds') = 'number', false) as seconds,
      coalesce(jsonb_typeof(target -> 'meters') = 'number', false) as meters
  )
  select case public.metric_target_kind(metrics)
    when 'reps' then coalesce(reps, false)
    when 'meters or seconds' then reps is null and (seconds or meters)
    else reps is null and seconds and not meters
  end
  from given;
$$;

-- target_kind() runs it as the caller.
revoke all on function public.metric_target_kind(public.exercise_metric[]) from public, anon;
grant execute on function public.metric_target_kind(public.exercise_metric[]) to authenticated;
revoke all on function public.target_kind(public.exercises) from public, anon;
grant execute on function public.target_kind(public.exercises) to authenticated;
