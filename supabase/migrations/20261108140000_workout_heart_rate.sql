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
-- fractions, which are rounded here, and a value no person or watch can have, such as a sensor's
-- spike, is left out on its own rather than failing the others; the ranges are the columns' checks
-- above. Heart rate is a pair, kept with its source: a read with both its average and highest
-- replaces them, and one without keeps what was kept. Calories are kept apart, and name the source
-- only while no heart rate does; a read without a source keeps the one kept. A read changes only
-- what it found, and the app sends only the values still missing (ADR 0098). Users still cannot
-- update their logs directly.
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
  caller_id uuid := (select auth.uid());
  average smallint := case when round(set_workout_health.heart_rate_avg) between 25 and 250
    then round(set_workout_health.heart_rate_avg) end;
  highest smallint := case when round(set_workout_health.heart_rate_max) between 25 and 250
    then round(set_workout_health.heart_rate_max) end;
  kcal integer := case when round(set_workout_health.active_kcal) between 0 and 5000
    then round(set_workout_health.active_kcal) end;
  named text := left(nullif(regexp_replace(set_workout_health.source, '^\s+|\s+$', '', 'g'), ''), 80);
  has_heart_rate boolean := average is not null and highest is not null;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  update public.workout_logs l
  set heart_rate_avg = case when has_heart_rate then least(average, highest) else l.heart_rate_avg end,
    heart_rate_max = case when has_heart_rate then highest else l.heart_rate_max end,
    active_kcal = coalesce(kcal, l.active_kcal),
    health_source = case
      when has_heart_rate or (kcal is not null and l.heart_rate_max is null)
        then coalesce(named, l.health_source)
      else l.health_source
    end
  where l.id = set_workout_health.log_id and l.user_id = caller_id;
  if not found then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;
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
