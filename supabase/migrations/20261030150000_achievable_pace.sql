-- The weekly pace the calculated targets really give (#332, ADR 0054). The targets take at most
-- 1000 kcal a day off maintenance and never go below the calorie floor, so for a light or
-- inactive user they may give less than the pace chosen; the app dates the goal by this one.

-- The pace the targets give for the answers: the chosen one (0.5 kg a week of loss or 0.25 of
-- gain without one), or, when the floor holds the calories up, the change the difference to
-- maintenance gives; 0 when the targets keep maintenance, null for a goal that keeps the weight.
create function public.achievable_weekly_pace_kg(
  sex public.sex,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  activity_level public.activity_level,
  training_days_per_week integer,
  goal public.goal_kind,
  target_weight_kg numeric default null,
  weekly_pace_kg numeric default null,
  pregnant_or_breastfeeding boolean default false
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  with calories as (
    select
      (public.calculate_nutrition_targets(
        sex, age, height_cm, weight_kg, activity_level, training_days_per_week, goal,
        target_weight_kg, weekly_pace_kg, pregnant_or_breastfeeding
      )).calories as target,
      -- Maintenance as the targets round it, held at the floor as they are.
      (public.calculate_nutrition_targets(
        sex, age, height_cm, weight_kg, activity_level, training_days_per_week, 'stay_healthy'
      )).calories as kept
  )
  select case
    when goal not in ('lose_fat', 'build_muscle') then null
    when c.target = c.kept then 0
    when c.target > public.calorie_floor(sex)
      then coalesce(weekly_pace_kg, case goal when 'lose_fat' then 0.5 else 0.25 end)
    -- 7700 kcal to a kilogram, as the targets reckon it.
    else round(abs(c.kept - c.target) * 7 / 7700.0, 2)
  end
  from calories c;
$$;

-- The caller's pace as their saved goal, activity and latest weight give it; null before the
-- onboarding is saved.
create function public.my_achievable_weekly_pace_kg()
returns numeric
language sql
stable
set search_path = ''
as $$
  select public.achievable_weekly_pace_kg(
    sex => p.sex,
    age => public.age_in_years(p.birth_year),
    height_cm => p.height_cm,
    weight_kg => public.my_latest_weight_kg(),
    activity_level => p.activity_level,
    training_days_per_week => cardinality(p.training_days),
    goal => g.kind,
    target_weight_kg => g.target_weight_kg,
    weekly_pace_kg => g.weekly_pace_kg,
    pregnant_or_breastfeeding => p.pregnant_or_breastfeeding
  )
  from public.profiles p
  join public.goals g on g.user_id = p.user_id
  where p.user_id = (select auth.uid())
    and public.my_latest_weight_kg() is not null;
$$;

revoke execute on function public.achievable_weekly_pace_kg from public, anon;
grant execute on function public.achievable_weekly_pace_kg to authenticated;
revoke execute on function public.my_achievable_weekly_pace_kg() from public, anon;
grant execute on function public.my_achievable_weekly_pace_kg() to authenticated;
