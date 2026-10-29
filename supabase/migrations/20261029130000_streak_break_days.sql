-- Why each missed day of a break did not count (#278), so that the break can offer what mends a
-- day before a freeze: a missed workout of this week can be postponed (ADR 0028), and a day
-- without meals can still be logged within the week.

-- As before (20261029120000), with each workout's name and type as its day shows them: those of
-- the day it is planned on, or, for a workout moved to the day, of the day it moved from, as kept
-- (ADR 0041). A new return type takes dropping it first.
drop function public.day_workouts(date, date, date);

create function public.day_workouts(from_day date, to_day date, today date)
returns table (
  day date,
  workout_id bigint,
  name text,
  type public.workout_type,
  done boolean,
  skipped boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with planned as (
    select p.day, p.workout_id, p.name, p.type
    from public.planned_workouts(day_workouts.from_day, day_workouts.to_day, day_workouts.today) p
  ),
  moves as (
    select m.workout_id, m.from_on, m.to_on, m.settled
    from public.workout_moves m
    where m.user_id = (select auth.uid())
      and (
        m.from_on between day_workouts.from_day and day_workouts.to_day
        or m.to_on between day_workouts.from_day and day_workouts.to_day
      )
  ),
  workouts as (
    select
      p.day,
      p.workout_id,
      p.name,
      p.type,
      m.to_on is null and m.from_on is not null and not m.settled as skipped
    from planned p
    left join moves m on m.workout_id = p.workout_id and m.from_on = p.day
    where m.from_on is null or m.to_on is null and not m.settled
    union
    -- Only a workout planned on the day it moved from counts on the day it moved to.
    select m.to_on, m.workout_id, source.name, source.type, false
    from moves m
    cross join lateral (
      select p.name, p.type
      from public.planned_workouts(m.from_on, m.from_on, day_workouts.today) p
      where p.workout_id = m.workout_id
    ) source
    where m.to_on between day_workouts.from_day and day_workouts.to_day
  )
  select
    w.day,
    w.workout_id,
    w.name,
    w.type,
    exists (
      select 1
      from public.workout_logs l
      where l.user_id = (select auth.uid())
        and l.source_workout_id = w.workout_id
        and l.started_on = w.day
    ),
    w.skipped
  from workouts w;
$$;

revoke execute on function public.day_workouts(date, date, date) from public, anon, authenticated;

-- What each of the caller's `days` missed, on the device's `today`: its workouts not done or
-- skipped, the calories eaten and its calorie target. The days are those streak() lists as missed
-- for the break, so that which days a break holds is decided in one place; at most a year of
-- them, before today.
create function public.streak_break_days(days date[], today date)
returns table (day date, workouts jsonb, eaten numeric, target integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  first_day date := (select min(d) from unnest(streak_break_days.days) d);
  last_day date := (select max(d) from unnest(streak_break_days.days) d);
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(streak_break_days.today);
  if first_day is null then
    return;
  end if;
  if first_day < streak_break_days.today - 366 or last_day >= streak_break_days.today then
    raise exception 'The days of a break are within the year before today' using errcode = '22023';
  end if;

  return query
  with missed as (
    select distinct d as day from unnest(streak_break_days.days) d
  ),
  workouts as (
    select
      w.day,
      jsonb_agg(
        jsonb_build_object('id', w.workout_id, 'name', w.name, 'type', w.type, 'skipped', w.skipped)
        order by w.workout_id
      ) as workouts
    from public.day_workouts(first_day, last_day, streak_break_days.today) w
    where w.skipped or not w.done
    group by w.day
  ),
  eaten as (
    select e.day, sum(e.kcal) as kcal
    from public.meal_entries e
    where e.user_id = (select auth.uid()) and e.day between first_day and last_day
    group by e.day
  )
  select
    m.day,
    coalesce(w.workouts, '[]'::jsonb),
    coalesce(e.kcal, 0),
    (public.targets_of_day(m.day, streak_break_days.today)).calories
  from missed m
  left join workouts w on w.day = m.day
  left join eaten e on e.day = m.day
  order by m.day;
end;
$$;

revoke execute on function public.streak_break_days(date[], date) from public, anon;
grant execute on function public.streak_break_days(date[], date) to authenticated;
