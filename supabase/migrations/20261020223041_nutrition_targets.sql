-- Daily calorie and macro targets. They are calculated whenever they are read rather than
-- stored, so they follow every change of weight, goal or profile. See ADR 0009.

create type public.nutrition_targets as (
  calories integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer
);

-- Calculates targets from the given answers, before or after they are saved.
create function public.calculate_nutrition_targets(
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

  -- Not recommended without medical supervision. "Prefer not to say" uses the midpoint.
  calorie_floor := case sex when 'male' then 1500 when 'female' then 1200 else 1350 end;
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

-- The current user's targets from their saved profile, goal and latest weight. Runs with the
-- caller's rights, so row level security applies. Returns null before the onboarding is saved.
create function public.my_nutrition_targets()
returns public.nutrition_targets
language sql
stable
set search_path = ''
as $$
  select public.calculate_nutrition_targets(
    sex => p.sex,
    age => extract(year from current_date)::integer - p.birth_year,
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

-- Only signed-in users, anonymous ones included, can call the functions.
revoke execute on function public.calculate_nutrition_targets from public, anon;
revoke execute on function public.my_nutrition_targets from public, anon;
grant execute on function public.calculate_nutrition_targets to authenticated;
grant execute on function public.my_nutrition_targets to authenticated;
