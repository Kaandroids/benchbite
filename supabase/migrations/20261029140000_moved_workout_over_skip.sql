-- A workout skipped on a day and moved there from another day counts by the move: the day keeps it
-- when it is done, as the week card shows it (#268).

-- As before (20261029130000), listing such a workout once as moved there rather than as skipped.
create or replace function public.day_workouts(from_day date, to_day date, today date)
returns table (
  day date,
  workout_id bigint,
  name text,
  type public.workout_type,
  done boolean,
  skipped boolean,
  counts boolean
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
      m.to_on is null and m.from_on is not null and not m.settled as skipped,
      0 as source
    from planned p
    left join moves m on m.workout_id = p.workout_id and m.from_on = p.day
    where m.from_on is null or m.to_on is null and not m.settled
    union all
    -- Only a workout planned on the day it moved from counts on the day it moved to.
    select m.to_on, m.workout_id, source.name, source.type, false, 1
    from moves m
    cross join lateral (
      select p.name, p.type
      from public.planned_workouts(m.from_on, m.from_on, day_workouts.today) p
      where p.workout_id = m.workout_id
    ) source
    where m.to_on between day_workouts.from_day and day_workouts.to_day
  ),
  once as (
    select distinct on (w.day, w.workout_id) w.*
    from workouts w
    order by w.day, w.workout_id, w.skipped, w.source
  )
  select
    o.day,
    o.workout_id,
    o.name,
    o.type,
    l.done,
    o.skipped,
    l.done and not o.skipped
  from once o
  cross join lateral (
    select exists (
      select 1
      from public.workout_logs g
      where g.user_id = (select auth.uid())
        and g.source_workout_id = o.workout_id
        and g.started_on = o.day
    ) as done
  ) l;
$$;
