-- The age of the user's targets is counted like the minimum age check, by age_in_years(), rather
-- than with a copy of its formula.
create or replace function public.my_nutrition_targets()
returns public.nutrition_targets
language sql
stable
set search_path = ''
as $$
  select public.calculate_nutrition_targets(
    sex => p.sex,
    age => public.age_in_years(p.birth_year),
    height_cm => p.height_cm,
    weight_kg => w.weight_kg,
    activity_level => p.activity_level,
    training_days_per_week => cardinality(p.training_days),
    goal => g.kind,
    target_weight_kg => g.target_weight_kg,
    weekly_pace_kg => g.weekly_pace_kg,
    pregnant_or_breastfeeding => p.pregnant_or_breastfeeding
  )
  from public.profiles p
  join public.goals g on g.user_id = p.user_id
  cross join lateral (
    select e.weight_kg
    from public.weight_entries e
    where e.user_id = p.user_id
    order by e.measured_on desc, e.id desc
    limit 1
  ) w
  where p.user_id = (select auth.uid());
$$;
