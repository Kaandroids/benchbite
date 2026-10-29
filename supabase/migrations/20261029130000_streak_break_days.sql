-- Why each missed day of a break did not count (#278), so that the break can offer what mends a
-- day before a freeze: a missed workout of this week can be postponed (ADR 0028), and a day
-- without meals can still be logged within the week.

-- The caller's missed days whose break is not answered yet, on the device's `today`, each with
-- its workouts that were not done or were skipped, the calories eaten and its calorie target. A
-- user who has not read the streak yet has nothing to answer, as streak() starts them on their
-- first read.
create function public.streak_break_days(today date)
returns table (day date, workouts jsonb, eaten numeric, target integer)
language sql
stable
security definer
set search_path = ''
as $$
  -- The last day answered: none yet for a user who answered nothing, and yesterday for one who
  -- has not read the streak.
  with answered as (
    select case when s.user_id is null then streak_break_days.today - 1 else s.answered_through end
      as through
    from (select 1) one
    left join public.user_streaks s on s.user_id = (select auth.uid())
  ),
  missed as (
    select s.day
    from answered a,
      public.streak_states(
        greatest(a.through + 1, public.streak_start()),
        streak_break_days.today - 1,
        streak_break_days.today
      ) s
    where s.state = 'missed'
  )
  select
    m.day,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', w.workout_id,
            'name', coalesce(o.name, k.name),
            'type', coalesce(o.type, k.type),
            'skipped', w.skipped
          )
          order by w.workout_id
        )
        from public.day_workouts(m.day, m.day, streak_break_days.today) w
        left join public.workouts o on o.id = w.workout_id
        -- A deleted workout keeps its name and type on the days kept with it (ADR 0041).
        left join public.planned_days k
          on k.user_id = (select auth.uid()) and k.day = m.day and k.workout_id = w.workout_id
        where w.skipped or not w.done
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select sum(e.kcal)
        from public.meal_entries e
        where e.user_id = (select auth.uid()) and e.day = m.day
      ),
      0
    ),
    (public.targets_of_day(m.day, streak_break_days.today)).calories
  from missed m
  order by m.day;
$$;

revoke execute on function public.streak_break_days(date) from public, anon;
grant execute on function public.streak_break_days(date) to authenticated;
