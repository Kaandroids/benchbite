-- The weekly pace of loss the calculated targets really give (#332, ADR 0054). The targets never
-- go below the calorie floor, so for a light or inactive user they may give less than the pace
-- chosen, or none; the app dates the goal by this one.

-- The weight a week that eating `target` kcal a day loses against `kept`, the targets of the same
-- user that keep the weight; 0 when they are the same. 7700 kcal to a kilogram, as the targets
-- reckon it.
create function public.weekly_loss_kg(kept integer, target integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(0, kept - target) * 7 / 7700.0, 2);
$$;

-- The pace of loss the targets give for answers not yet saved, as the onboarding has them; null
-- for a goal that does not lose weight, whose targets the floor never holds back.
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
  select public.weekly_loss_kg(
    (public.calculate_nutrition_targets(
      sex, age, height_cm, weight_kg, activity_level, training_days_per_week, 'stay_healthy'
    )).calories,
    (public.calculate_nutrition_targets(
      sex, age, height_cm, weight_kg, activity_level, training_days_per_week, goal,
      target_weight_kg, weekly_pace_kg, pregnant_or_breastfeeding
    )).calories
  )
  where goal = 'lose_fat';
$$;

-- The caller's pace of loss, from their calculated targets against those that keep the weight;
-- null before the onboarding is saved, or for a goal that does not lose weight.
create function public.my_achievable_weekly_pace_kg()
returns numeric
language sql
stable
set search_path = ''
as $$
  select public.weekly_loss_kg(
    (public.preview_nutrition_targets('stay_healthy', null, null, p.activity_level)).calories,
    (public.calculated_nutrition_targets()).calories
  )
  from public.profiles p
  join public.goals g on g.user_id = p.user_id
  where p.user_id = (select auth.uid())
    and g.kind = 'lose_fat';
$$;

revoke execute on function public.weekly_loss_kg from public, anon;
grant execute on function public.weekly_loss_kg to authenticated;
revoke execute on function public.achievable_weekly_pace_kg from public, anon;
grant execute on function public.achievable_weekly_pace_kg to authenticated;
revoke execute on function public.my_achievable_weekly_pace_kg() from public, anon;
grant execute on function public.my_achievable_weekly_pace_kg() to authenticated;
