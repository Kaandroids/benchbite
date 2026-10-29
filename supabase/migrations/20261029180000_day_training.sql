-- How the caller trained on each day of a range, at most a year, for the Progress tab's heat map
-- (ADR 0047): the minutes and the weight lifted in the workouts started on the day, and how many
-- of the day's planned workouts were done or missed, as the streak counts them (ADR 0044).
create function public.day_training(from_day date, to_day date, today date)
returns table (
  day date,
  minutes integer,
  lifted_kg numeric,
  done integer,
  missed integer
)
language plpgsql
stable
-- Reads day_workouts(), which users may not; it reads the caller's rows only.
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_device_today(day_training.today);

  return query
  with bounds as (
    select
      day_training.from_day as first_day,
      -- A year back over a 29 February spans 367 days.
      least(day_training.to_day, day_training.from_day + 366) as last_day
  ),
  days as (
    select d::date as day
    from bounds b, generate_series(b.first_day, b.last_day, interval '1 day') d
  ),
  logs as (
    select
      g.started_on as day,
      sum(extract(epoch from g.finished_at - g.started_at)) / 60 as minutes,
      sum(coalesce(s.kilograms, 0)) as lifted_kg
    from bounds b
    join public.workout_logs g
      on g.user_id = (select auth.uid()) and g.started_on between b.first_day and b.last_day
    left join lateral (
      select sum(l.weight_kg * l.reps) as kilograms
      from public.logged_sets l
      where l.log_id = g.id
    ) s on true
    group by g.started_on
  ),
  -- Only from the day the streak starts: before it, the plan was not the user's yet.
  planned as (
    select
      w.day,
      count(*) filter (where w.counts) as done,
      count(*) filter (where not w.counts and w.day < day_training.today) as missed
    from bounds b
    cross join lateral public.day_workouts(
      greatest(b.first_day, public.streak_start()), b.last_day, day_training.today
    ) w
    group by w.day
  )
  select
    d.day,
    -- Up to the next minute, so that a day with a workout never reads as none.
    coalesce(ceil(g.minutes), 0)::integer,
    coalesce(g.lifted_kg, 0),
    coalesce(p.done, 0)::integer,
    coalesce(p.missed, 0)::integer
  from days d
  left join logs g on g.day = d.day
  left join planned p on p.day = d.day
  order by d.day;
end;
$$;

revoke execute on function public.day_training(date, date, date) from public, anon;
grant execute on function public.day_training(date, date, date) to authenticated;
