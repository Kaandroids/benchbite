-- The Progress tab charts what was eaten over up to a year (ADR 0047), so day_nutrition() reads a
-- year of days rather than a month, 367 over a 29 February. Each day also says whether its
-- calories kept its target as the streak counts them (calories_count()), so that the app does not
-- repeat that rule. As before (20261029150000) otherwise; a new column needs the function dropped.

drop function public.day_nutrition(date, date, date);

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
  target_fat_g integer,
  kept_target boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.assert_device_today(day_nutrition.today);

  return query
  with bounds as (
    select
      day_nutrition.from_day as first_day,
      least(day_nutrition.to_day, day_nutrition.from_day + 366) as last_day
  ),
  days as (
    select d::date as day
    from bounds b, generate_series(b.first_day, b.last_day, interval '1 day') d
  ),
  eaten as (
    select c.day, c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.entries
    from bounds b, public.day_calories(b.first_day, b.last_day) c
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
    t.fat_g,
    coalesce(public.calories_count(e.kcal, t.calories), false)
  from days d
  cross join lateral public.targets_of_day(d.day, day_nutrition.today) t
  left join eaten e on e.day = d.day
  order by d.day;
end;
$$;

revoke execute on function public.day_nutrition(date, date, date) from public, anon;
grant execute on function public.day_nutrition(date, date, date) to authenticated;
