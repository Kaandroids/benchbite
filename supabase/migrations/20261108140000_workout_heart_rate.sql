-- The heart rate and active calories a watch measured during a workout, read from Apple Health or
-- Health Connect on the phone (#85, ADR 0098). Only a summary is kept: the average and highest
-- heart rate, the calories, and the app that measured them.
alter table public.workout_logs
  add column heart_rate_avg smallint check (heart_rate_avg between 25 and 250),
  add column heart_rate_max smallint check (heart_rate_max between 25 and 250),
  add column active_kcal smallint check (active_kcal between 1 and 5000),
  add column health_source text check (length(health_source) between 1 and 80),
  add check (heart_rate_avg <= heart_rate_max);

-- Keeps what the phone's health store measured for one of the caller's workouts, in place of what
-- was kept before, as a watch's data can arrive in parts. Users still cannot update their logs
-- directly.
create function public.set_workout_health(
  p_log_id bigint,
  p_heart_rate_avg smallint,
  p_heart_rate_max smallint,
  p_active_kcal smallint,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workout_logs
  set heart_rate_avg = p_heart_rate_avg,
    heart_rate_max = p_heart_rate_max,
    active_kcal = p_active_kcal,
    health_source = nullif(trim(p_source), '')
  where id = p_log_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Workout log not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_workout_health(bigint, smallint, smallint, smallint, text)
  from public, anon;
grant execute on function public.set_workout_health(bigint, smallint, smallint, smallint, text)
  to authenticated;

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
  l.planned_exercise_ids,
  l.alternative_name,
  l.alternative_position,
  l.heart_rate_avg,
  l.heart_rate_max,
  l.active_kcal,
  l.health_source
from public.workout_logs l
cross join lateral (
  select
    count(distinct t.exercise_position)::integer as exercises,
    count(*)::integer as sets,
    coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
  from public.logged_sets t
  where t.log_id = l.id
) s;
