-- The heart rate and active calories a watch measured during a workout, read from Apple Health or
-- Health Connect on the phone (#85, ADR 0098). Only a summary is kept: the average and highest
-- heart rate, the calories, and the app that measured them.
alter table public.workout_logs
  add column heart_rate_avg smallint check (heart_rate_avg between 25 and 250),
  add column heart_rate_max smallint check (heart_rate_max between 25 and 250),
  add column active_kcal integer check (active_kcal between 0 and 5000),
  add column health_source text check (length(health_source) between 1 and 80),
  add check (heart_rate_avg <= heart_rate_max);

-- Keeps what the phone's health store measured for one of the caller's workouts. The stores give
-- fractions, which are rounded here. A value read as missing keeps what was kept before, as a
-- watch's data can arrive in parts or a later read find less; a value no person or watch can have,
-- such as a sensor's spike, is left out on its own rather than failing the others. The source
-- changes only with a value. Users still cannot update their logs directly.
create function public.set_workout_health(
  log_id bigint,
  heart_rate_avg numeric default null,
  heart_rate_max numeric default null,
  active_kcal numeric default null,
  source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avg smallint := case when round(set_workout_health.heart_rate_avg) between 25 and 250
    then round(set_workout_health.heart_rate_avg) end;
  v_max smallint := case when round(set_workout_health.heart_rate_max) between 25 and 250
    then round(set_workout_health.heart_rate_max) end;
  v_kcal integer := case when round(set_workout_health.active_kcal) between 0 and 5000
    then round(set_workout_health.active_kcal) end;
  v_source text := nullif(trim(set_workout_health.source), '');
  v_log public.workout_logs;
begin
  select * into v_log from public.workout_logs l
  where l.id = set_workout_health.log_id and l.user_id = (select auth.uid())
  for update;
  if v_log is null then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;
  if coalesce(v_avg, v_max, v_kcal) is null then
    return;
  end if;

  v_avg := coalesce(v_avg, v_log.heart_rate_avg);
  v_max := coalesce(v_max, v_log.heart_rate_max);
  -- Rounding, or a part read before, can leave the average above the highest.
  if v_avg > v_max then
    v_avg := v_max;
  end if;

  update public.workout_logs l
  set heart_rate_avg = v_avg,
    heart_rate_max = v_max,
    active_kcal = coalesce(v_kcal, v_log.active_kcal),
    health_source = coalesce(left(v_source, 80), v_log.health_source)
  where l.id = v_log.id;
end;
$$;

revoke execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text)
  from public, anon;
grant execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text)
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
