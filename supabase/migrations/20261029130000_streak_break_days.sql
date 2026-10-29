-- Why each missed day of a break did not count (#278), so that the break can offer what mends a
-- day before a freeze: a missed workout of this week can be postponed (ADR 0028), and a day
-- without meals can still be logged within the week. A break that reaches back more than a week
-- ends by itself, as starting again (ADR 0045).

-- The first day a break of the streak holds on the device's `today`: a week before it. Earlier
-- missed days end by themselves (ADR 0045).
create function public.first_day_of_break(today date)
returns date
language sql
immutable
set search_path = ''
as $$
  select first_day_of_break.today - 7;
$$;

-- Whether a day's calories keep it: more than none and no more than its target (ADR 0044).
create function public.calories_count(kcal numeric, target integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(calories_count.kcal, 0) > 0 and calories_count.kcal <= calories_count.target;
$$;

-- The calories the caller ate on each day from `from_day` to `to_day` that has entries, as both
-- the streak and the reasons of a break count them.
create function public.day_calories(from_day date, to_day date)
returns table (day date, kcal numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select e.day, sum(e.kcal)
  from public.meal_entries e
  where e.user_id = (select auth.uid()) and e.day between day_calories.from_day and day_calories.to_day
  group by e.day;
$$;

-- As before (20261029120000), with each workout's name and type as its day shows them: those of
-- the day it is planned on, or, for a workout moved to the day, of the day it moved from, as kept
-- (ADR 0041). `counts` says whether it keeps its day: done and not skipped. A workout is listed
-- once a day, as planned before as moved. A new return type takes dropping it first.
drop function public.day_workouts(date, date, date);

create function public.day_workouts(from_day date, to_day date, today date)
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
    order by w.day, w.workout_id, w.source
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

revoke execute on function public.day_workouts(date, date, date) from public, anon, authenticated;

-- As before (20261029110000), reading a day's workouts and calories as the reasons of a break do.
create or replace function public.streak_states(from_day date, to_day date, today date)
returns table (day date, state public.streak_state)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      greatest(streak_states.from_day, public.streak_start()) as first_day,
      least(streak_states.to_day, streak_states.today, streak_states.from_day + 366) as last_day
  ),
  days as (
    select d::date as day
    from bounds b, generate_series(b.first_day, b.last_day, interval '1 day') d
  ),
  workouts as (
    select w.day, bool_and(w.counts) as all_done
    from bounds b, public.day_workouts(b.first_day, b.last_day, streak_states.today) w
    group by w.day
  ),
  eaten as (
    select c.day, c.kcal
    from bounds b, public.day_calories(b.first_day, b.last_day) c
  ),
  worked_out as (
    select
      d.day,
      coalesce(w.all_done, true)
        and public.calories_count(e.kcal, (public.targets_of_day(d.day, streak_states.today)).calories)
        as counts
    from days d
    left join workouts w on w.day = d.day
    left join eaten e on e.day = d.day
  )
  select
    o.day,
    case
      when k.result is not null and o.day < streak_states.today then k.result
      when o.counts then 'done'
      when o.day >= streak_states.today then 'open'
      else 'missed'
    end::public.streak_state
  from worked_out o
  left join public.streak_days k on k.user_id = (select auth.uid()) and k.day = o.day
  order by o.day;
$$;

-- How each of the caller's days went from their first day to the device's `today`: kept days
-- before `first_open`, as kept, and the days from it worked out.
create function public.my_streak_states(first_open date, today date)
returns table (day date, state public.streak_state)
language sql
stable
security definer
set search_path = ''
as $$
  select k.day, k.result
  from public.streak_days k
  where k.user_id = (select auth.uid()) and k.day < my_streak_states.first_open
  union all
  select s.day, s.state
  from public.streak_states(my_streak_states.first_open, my_streak_states.today, my_streak_states.today) s;
$$;

-- Answers the caller's breaks through `through`, on the device's `today`: keeps the days through it
-- with how they went, and records them as answered. Returns the first day not kept.
create function public.answer_breaks_through(through date, today date)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_open date := public.keep_streak_days(answer_breaks_through.through, answer_breaks_through.today);
begin
  update public.user_streaks u
  set answered_through = greatest(u.answered_through, answer_breaks_through.through)
  where u.user_id = (select auth.uid());
  return first_open;
end;
$$;

-- As before (20261029110000), but a break that reaches back to a missed day more than a week before
-- the device's today ends by itself, as starting again (ADR 0045): its whole run of missed days is
-- answered without spending freezes, and only later missed days ask to be answered. The days are
-- worked out once and read from there.
create or replace function public.streak(today date)
returns table (
  count integer,
  counted_today boolean,
  freezes integer,
  missed date[],
  saved_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  mine public.user_streaks;
  first_open date;
  days date[];
  states public.streak_state[];
  old_missed date;
  run_end date;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(streak.today);
  mine := public.lock_user_streak(streak.today);
  -- Today is always worked out, also when the device's day went back past a kept one.
  first_open := least(
    public.keep_streak_days(
      least(streak.today - 1, public.last_day_closed_to_logging()), streak.today
    ),
    streak.today
  );
  select array_agg(s.day order by s.day), array_agg(s.state order by s.day)
  into days, states
  from public.my_streak_states(first_open, streak.today) s;

  -- The last missed day not answered yet before the break's first day, and the end of its run.
  select max(d.day) into old_missed
  from unnest(days, states) d (day, state)
  where d.state = 'missed'
    and d.day > coalesce(mine.answered_through, '-infinity')
    and d.day < public.first_day_of_break(streak.today);
  if old_missed is not null then
    select coalesce(min(d.day) - 1, streak.today - 1) into run_end
    from unnest(days, states) d (day, state)
    where d.day > old_missed and d.state <> 'missed';
    perform public.answer_breaks_through(run_end, streak.today);
    select * into mine from public.user_streaks u where u.user_id = (select auth.uid());
  end if;

  return query
  with states as (
    select d.day, d.state from unnest(days, states) d (day, state)
  ),
  -- The last missed day before today, and the last one whose break was answered.
  breaks as (
    select
      max(s.day) filter (where s.state = 'missed') as last_missed,
      max(s.day) filter (
        where s.state = 'missed' and s.day <= coalesce(mine.answered_through, '-infinity')
      ) as last_answered
    from states s
    where s.day < streak.today
  ),
  today_state as (
    select coalesce(bool_or(s.state = 'done'), false) as counted
    from states s
    where s.day = streak.today
  )
  select
    (
      select count(*)::integer from states s
      where s.day > coalesce(b.last_missed, '-infinity') and s.day < streak.today
    ) + t.counted::integer,
    t.counted,
    mine.freezes,
    coalesce(
      (
        select array_agg(s.day order by s.day) from states s
        where s.state = 'missed'
          and s.day > coalesce(mine.answered_through, '-infinity') and s.day < streak.today
      ),
      '{}'
    ),
    (
      select count(*)::integer from states s
      where s.day > coalesce(b.last_answered, '-infinity') and s.day < streak.today
    ) + t.counted::integer
  from breaks b, today_state t;
end;
$$;

-- As before (20261029110000), answering through yesterday as a long break ends by itself.
create or replace function public.answer_streak_break(today date, use_freezes boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mine public.user_streaks;
  missed date[];
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(answer_streak_break.today);
  mine := public.lock_user_streak(answer_streak_break.today);
  perform public.keep_streak_days(answer_streak_break.today - 1, answer_streak_break.today);

  select coalesce(array_agg(k.day), '{}') into missed
  from public.streak_days k
  where k.user_id = (select auth.uid())
    and k.result = 'missed'
    and k.day > coalesce(mine.answered_through, '-infinity')
    and k.day < answer_streak_break.today;

  if use_freezes and cardinality(missed) > 0 then
    if mine.freezes < cardinality(missed) then
      raise exception 'Not enough freezes for the missed days' using errcode = 'BB032';
    end if;
    update public.streak_days k set result = 'frozen'
    where k.user_id = (select auth.uid()) and k.day = any (missed);
    update public.user_streaks s set freezes = s.freezes - cardinality(missed)
    where s.user_id = (select auth.uid());
  end if;

  perform public.answer_breaks_through(answer_streak_break.today - 1, answer_streak_break.today);
end;
$$;

-- A workout of a missed day that kept it from counting, for the break to offer what mends it.
create type public.break_workout as (
  id bigint,
  name text,
  type public.workout_type,
  skipped boolean
);

-- What each of the caller's `days` missed, on the device's `today`: its workouts that did not
-- keep it, the calories eaten, its calorie target and whether they kept it. Callers pass the days
-- streak() lists as missed for the break; days before the break's first day and from today on
-- are left out.
create function public.streak_break_days(days date[], today date)
returns table (
  day date,
  workouts public.break_workout[],
  eaten numeric,
  target integer,
  calories_count boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(streak_break_days.today);

  return query
  with missed as (
    select distinct d as day
    from unnest(streak_break_days.days) d
    where d between public.first_day_of_break(streak_break_days.today) and streak_break_days.today - 1
  ),
  bounds as (
    select min(m.day) as first_day, max(m.day) as last_day from missed m
  ),
  workouts as (
    select
      w.day,
      array_agg(
        row(w.workout_id, w.name, w.type, w.skipped)::public.break_workout order by w.workout_id
      ) as workouts
    from bounds b, public.day_workouts(b.first_day, b.last_day, streak_break_days.today) w
    where not w.counts
    group by w.day
  ),
  eaten as (
    select c.day, c.kcal from bounds b, public.day_calories(b.first_day, b.last_day) c
  )
  select
    m.day,
    coalesce(w.workouts, '{}'),
    coalesce(e.kcal, 0),
    t.calories,
    public.calories_count(e.kcal, t.calories)
  from missed m
  cross join lateral public.targets_of_day(m.day, streak_break_days.today) t
  left join workouts w on w.day = m.day
  left join eaten e on e.day = m.day
  order by m.day;
end;
$$;

revoke execute on function
  public.first_day_of_break(date),
  public.calories_count(numeric, integer),
  public.day_calories(date, date),
  public.my_streak_states(date, date),
  public.answer_breaks_through(date, date)
from public, anon, authenticated;

revoke execute on function public.streak_break_days(date[], date) from public, anon;
grant execute on function public.streak_break_days(date[], date) to authenticated;
