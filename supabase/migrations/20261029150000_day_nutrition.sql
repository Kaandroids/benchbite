-- What the caller ate on each day of a range, against the targets each day kept, for a past week
-- on the Today tab (#71, ADR 0046).

-- As before (20261029130000), with the macros and the number of entries, so that the streak and
-- the week read what was eaten on a day from one place. A new return type takes dropping it first.
drop function public.day_calories(date, date);

create function public.day_calories(from_day date, to_day date)
returns table (
  day date,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  entries integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.day, sum(e.kcal), sum(e.protein_g), sum(e.carbs_g), sum(e.fat_g), count(*)::integer
  from public.meal_entries e
  where e.user_id = (select auth.uid()) and e.day between day_calories.from_day and day_calories.to_day
  group by e.day;
$$;

revoke execute on function public.day_calories(date, date) from public, anon, authenticated;

-- The calories and macros the caller ate on each day from `from_day` to `to_day`, at most a month
-- of them, with the number of entries and the targets each day is measured against
-- (targets_of_day(), ADR 0040) on the device's `today`. A day without entries has eaten none; its
-- targets are null for a user who has none in use.
create function public.day_nutrition(from_day date, to_day date, today date)
returns table (
  day date,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  entries integer,
  target_calories integer,
  target_protein_g integer,
  target_carbs_g integer,
  target_fat_g integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select
      day_nutrition.from_day as first_day,
      least(day_nutrition.to_day, day_nutrition.from_day + 30) as last_day
  ),
  days as (
    select d::date as day
    from bounds b, generate_series(b.first_day, b.last_day, interval '1 day') d
  )
  select
    d.day,
    coalesce(e.kcal, 0),
    coalesce(e.protein_g, 0),
    coalesce(e.carbs_g, 0),
    coalesce(e.fat_g, 0),
    coalesce(e.entries, 0),
    t.calories,
    t.protein_g,
    t.carbs_g,
    t.fat_g
  from days d
  cross join lateral public.targets_of_day(d.day, day_nutrition.today) t
  left join (
    select c.* from bounds b, public.day_calories(b.first_day, b.last_day) c
  ) e on e.day = d.day
  order by d.day;
$$;

revoke execute on function public.day_nutrition(date, date, date) from public, anon;
grant execute on function public.day_nutrition(date, date, date) to authenticated;
