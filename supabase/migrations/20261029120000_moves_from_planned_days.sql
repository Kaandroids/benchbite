-- A workout moved to a day counts on it only when it was planned on the day it moved from, as the
-- week card reads moves (ADR 0028). A move from a day the workout is not planned on, such as a day
-- before the plan started, is left out, so the day it moved to does not need it for the streak.

-- As before (20261029110000), with a move to a day checked against the day it moved from.
create or replace function public.day_workouts(from_day date, to_day date, today date)
returns table (day date, workout_id bigint, done boolean, skipped boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with planned as (
    select p.day, p.workout_id
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
    select p.day, p.workout_id, m.to_on is null and m.from_on is not null and not m.settled as skipped
    from planned p
    left join moves m on m.workout_id = p.workout_id and m.from_on = p.day
    where m.from_on is null or m.to_on is null and not m.settled
    union
    select m.to_on, m.workout_id, false
    from moves m
    where m.to_on between day_workouts.from_day and day_workouts.to_day
      and exists (
        select 1
        from public.planned_workouts(m.from_on, m.from_on, day_workouts.today) p
        where p.workout_id = m.workout_id
      )
  )
  select
    w.day,
    w.workout_id,
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
