-- What the caller ate on each day of a range, against the targets each day kept, for a past week
-- on the Today tab (#71, ADR 0046).

-- The calories and macros the caller ate on each day from `from_day` to `to_day`, at most a month
-- of them, with the targets each day is measured against (targets_of_day(), ADR 0040) on the
-- device's `today`. A day without entries has eaten none.
create function public.days_nutrition(from_day date, to_day date, today date)
returns table (
  day date,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  target_calories integer,
  target_protein_g integer,
  target_carbs_g integer,
  target_fat_g integer
)
language sql
stable
set search_path = ''
as $$
  with days as (
    select d::date as day
    from generate_series(
      days_nutrition.from_day,
      least(days_nutrition.to_day, days_nutrition.from_day + 30),
      interval '1 day'
    ) d
  ),
  eaten as (
    select
      e.day,
      sum(e.kcal) as kcal,
      sum(e.protein_g) as protein_g,
      sum(e.carbs_g) as carbs_g,
      sum(e.fat_g) as fat_g
    from public.meal_entries e
    where e.user_id = (select auth.uid())
      and e.day between days_nutrition.from_day and days_nutrition.to_day
    group by e.day
  )
  select
    d.day,
    coalesce(e.kcal, 0),
    coalesce(e.protein_g, 0),
    coalesce(e.carbs_g, 0),
    coalesce(e.fat_g, 0),
    t.calories,
    t.protein_g,
    t.carbs_g,
    t.fat_g
  from days d
  cross join lateral public.targets_of_day(d.day, days_nutrition.today) t
  left join eaten e on e.day = d.day
  order by d.day;
$$;

revoke execute on function public.days_nutrition(date, date, date) from public, anon;
grant execute on function public.days_nutrition(date, date, date) to authenticated;
