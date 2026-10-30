-- The least calories a day the targets ever give, in one place, so that Bite, the AI coach, is
-- told the same floor the targets keep to (#292, ADR 0052).

-- Not recommended without medical supervision. "Prefer not to say" uses the midpoint.
create function public.calorie_floor(sex public.sex)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case sex when 'male' then 1500 when 'female' then 1200 else 1350 end;
$$;

revoke all on function public.calorie_floor(public.sex) from public, anon;
grant execute on function public.calorie_floor(public.sex) to authenticated;

-- As before (20261020223041), with the floor from calorie_floor().
create or replace function public.calculate_nutrition_targets(
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
returns public.nutrition_targets
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Energy in one kilogram of body weight change. A static first-order estimate that ignores
  -- metabolic adaptation; the caps below keep the result safe.
  kcal_per_kg constant numeric := 7700;
  max_deficit constant numeric := 1000;
  max_surplus constant numeric := 500;
  -- Physical activity levels from sedentary to active, multiplied with the BMR.
  activity_factors constant numeric[] := array[1.2, 1.375, 1.55, 1.725];
  activity_step integer;
  bmr numeric;
  maintenance numeric;
  daily_change numeric := 0;
  calorie_floor integer;
  result public.nutrition_targets;
  protein_basis_kg numeric := weight_kg;
begin
  if sex is null or age is null or height_cm is null or weight_kg is null
    or activity_level is null or training_days_per_week is null or goal is null then
    raise exception 'All arguments except the target weight and the pace are required';
  end if;

  -- Mifflin-St Jeor. "Prefer not to say" uses the midpoint of the female and male constants.
  bmr := 10 * weight_kg + 6.25 * height_cm - 5 * age
    + case sex when 'male' then 5 when 'female' then -161 else -78 end;

  -- The activity answer covers daily movement outside workouts, so training moves it up one
  -- step for 2 to 4 sessions a week and two steps for 5 or more.
  activity_step := least(
    array_position(enum_range(null::public.activity_level), activity_level)
      + case when training_days_per_week >= 5 then 2 when training_days_per_week >= 2 then 1 else 0 end,
    4
  );
  maintenance := bmr * activity_factors[activity_step];

  -- Only goals that change the weight get a deficit or surplus, and only when the target weight,
  -- if there is one, lies in the goal's direction. Without a pace, 0.5 kg a week of loss and
  -- 0.25 kg a week of gain are assumed.
  if goal = 'lose_fat' and (target_weight_kg is null or target_weight_kg < weight_kg) then
    daily_change := -least(coalesce(weekly_pace_kg, 0.5) * kcal_per_kg / 7, max_deficit);
  elsif goal = 'build_muscle' and (target_weight_kg is null or target_weight_kg > weight_kg) then
    daily_change := least(coalesce(weekly_pace_kg, 0.25) * kcal_per_kg / 7, max_surplus);
  end if;

  -- No deficit or surplus is recommended during pregnancy or breastfeeding.
  if pregnant_or_breastfeeding then
    daily_change := 0;
  end if;

  calorie_floor := public.calorie_floor(sex);
  result.calories := greatest(calorie_floor, round((maintenance + daily_change) / 10) * 10);

  -- Protein of 1.8 g per kilogram, from the lower of the current and target weight when losing
  -- fat, and at most 40 % of the calories. With fat at 25 %, the carbohydrates that fill the rest
  -- can then never be negative, and the macros add up to the calories.
  if goal = 'lose_fat' and target_weight_kg is not null then
    protein_basis_kg := least(weight_kg, target_weight_kg);
  end if;
  result.protein_g := least(round(1.8 * protein_basis_kg), floor(result.calories * 0.4 / 4));
  result.fat_g := round(result.calories * 0.25 / 9);
  -- Divided by 4.0, as integer division would truncate instead of round.
  result.carbs_g := greatest(0, round((result.calories - result.protein_g * 4 - result.fat_g * 9) / 4.0));

  return result;
end;
$$;
