-- When each of the caller's workouts was last trained, as the choice of what stays shows it
-- (ADR 0083), so that the app need not read every log for one date of each workout.
create function public.workouts_last_trained()
returns table (workout_id bigint, started_on date)
language sql
stable
set search_path = ''
as $$
  select l.workout_id, max(l.started_on)
  from public.workout_logs l
  where l.user_id = (select auth.uid()) and l.workout_id is not null
  group by l.workout_id;
$$;

revoke execute on function public.workouts_last_trained() from public, anon;
grant execute on function public.workouts_last_trained() to authenticated;
