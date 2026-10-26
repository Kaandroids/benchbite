-- Reference values for calculate_nutrition_targets(). The base case is a 30-year-old man,
-- 180 cm and 80 kg, moderately active: BMR 1780 kcal, maintenance 1780 * 1.55 = 2759 kcal.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

select is(
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'stay_healthy'),
  row(2760, 144, 373, 77)::public.nutrition_targets,
  'Maintenance follows Mifflin-St Jeor, rounded to 10 kcal, with 1.8 g/kg protein and 25 % fat'
);

select is(
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'get_stronger'),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'stay_healthy'),
  'Getting stronger keeps maintenance calories'
);

select is(
  (public.calculate_nutrition_targets('unspecified', 30, 180, 80, 'moderate', 0, 'stay_healthy')).calories,
  2630,
  'Prefer not to say uses the midpoint of the sex constants'
);

-- The onboarding's activity step shows these factors too (ACTIVITY_FACTORS in
-- src/onboarding/body.ts): 1.2, 1.375, 1.55 and 1.725. Change both.
select is(
  array(
    select (public.calculate_nutrition_targets('male', 30, 180, 80, level, 0, 'stay_healthy')).calories
    from unnest(enum_range(null::public.activity_level)) level
  ),
  array[2140, 2450, 2760, 3070],
  'The activity levels multiply the BMR by 1.2, 1.375, 1.55 and 1.725'
);

select is(
  public.calculate_nutrition_targets('male', 30, 180, 80, 'light', 3, 'stay_healthy'),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'stay_healthy'),
  'Two to four training days raise the activity level by one step'
);

select is(
  public.calculate_nutrition_targets('male', 30, 180, 80, 'sedentary', 5, 'stay_healthy'),
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'stay_healthy'),
  'Five or more training days raise the activity level by two steps'
);

select is(
  (public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'lose_fat', 75, 0.5)).calories,
  2210,
  'Losing 0.5 kg a week means a deficit of 550 kcal a day'
);

select is(
  (public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'lose_fat', 60, 1.5)).calories,
  1760,
  'The deficit is capped at 1000 kcal a day'
);

select is(
  (public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'build_muscle')).calories,
  3030,
  'Building muscle without a pace assumes 0.25 kg a week, a surplus of 275 kcal'
);

select is(
  (public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'build_muscle', 95, 1.0)).calories,
  3260,
  'The surplus is capped at 500 kcal a day'
);

select is(
  (public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'lose_fat', 85, 0.5)).calories,
  2760,
  'A target weight on the wrong side of the goal gives no deficit'
);

select is(
  (public.calculate_nutrition_targets('female', 30, 165, 70, 'light', 3, 'lose_fat', 60, 1.0, true)).calories,
  (public.calculate_nutrition_targets('female', 30, 165, 70, 'light', 3, 'stay_healthy')).calories,
  'There is no deficit during pregnancy or breastfeeding'
);

select is(
  (public.calculate_nutrition_targets('female', 25, 150, 45, 'sedentary', 0, 'lose_fat', 40, 1.0)).calories,
  1200,
  'Calories never drop below the floor of 1200 kcal for women'
);

select is(
  (public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 0, 'lose_fat', 75, 0.5)).protein_g,
  135,
  'Protein is based on the target weight when it is lower'
);

select ok(
  (
    select t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9 <= t.calories + 5 and t.carbs_g >= 0
    from public.calculate_nutrition_targets('female', 65, 150, 130, 'sedentary', 0, 'lose_fat', 100, 1.5) t
  ),
  'Macros add up to the calories when the floor applies to a heavy person'
);

select throws_ok(
  $$ select public.calculate_nutrition_targets('male', null, 180, 80, 'moderate', 0, 'stay_healthy') $$,
  'P0001',
  'All arguments except the target weight and the pace are required',
  'Missing required answers are rejected'
);

select * from finish();
rollback;
