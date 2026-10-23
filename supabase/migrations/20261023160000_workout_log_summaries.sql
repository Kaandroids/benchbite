-- A finished workout at a glance, for the history: its exercises and sets, of how many planned,
-- the weight lifted and an estimate of the calories burned. Calories are estimated from the time and the user's weight on that day
-- until a watch measures them (#85). Without a weight there is no estimate. Planned workouts get
-- an estimate from the user's latest weight.

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

create view public.workout_log_summaries
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
  round(
    public.strength_kcal_per_minute(w.weight_kg)
    * extract(epoch from l.finished_at - l.started_at) / 60
  )::integer as estimated_kcal
from public.workout_logs l
cross join lateral (
  select
    count(distinct t.exercise_position)::integer as exercises,
    count(*)::integer as sets,
    coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
  from public.logged_sets t
  where t.log_id = l.id
) s
left join lateral (
  select e.weight_kg
  from public.weight_entries e
  where e.user_id = l.user_id and e.measured_on <= l.finished_at::date
  order by e.measured_on desc
  limit 1
) w on true;

grant select on public.workout_log_summaries to authenticated;
revoke all on public.workout_log_summaries from anon;
