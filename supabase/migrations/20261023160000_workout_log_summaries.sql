-- A finished workout at a glance, for the history: its sets, the weight lifted and an estimate of
-- the calories burned. Calories are estimated from the time and the user's weight on that day, at
-- 5 METs for strength training, until a watch measures them (#85). Without a weight there is no
-- estimate.
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
  s.sets,
  s.kilograms,
  round(5.0 * w.weight_kg * extract(epoch from l.finished_at - l.started_at) / 3600)::integer
    as estimated_kcal
from public.workout_logs l
cross join lateral (
  select count(*)::integer as sets, coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
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
