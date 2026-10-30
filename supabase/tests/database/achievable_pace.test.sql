-- The pace the targets really give. A 30-year-old woman, 165 cm, training three days a week.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 70, 'moderate', 3, 'lose_fat', 65, 0.9),
  0.9,
  'The chosen pace, when the targets can give it'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 60, 'sedentary', 3, 'lose_fat', 55, 0.9),
  0.56,
  'Less, when the floor holds the calories up: (1820 - 1200) * 7 / 7700'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 70, 'moderate', 3, 'lose_fat', 65),
  0.5,
  'Half a kilogram of loss a week without a pace, as the targets assume'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 145, 40, 'sedentary', 0, 'lose_fat', 38, 0.5),
  0::numeric,
  'Nothing, when maintenance is already at the floor'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 60, 'moderate', 3, 'build_muscle', 65, 0.25),
  0.25,
  'The chosen pace of a goal to gain'
);
select is(
  public.achievable_weekly_pace_kg('female', 30, 165, 60, 'moderate', 3, 'stay_healthy'),
  null,
  'None for a goal that keeps the weight'
);

select ok(
  not has_function_privilege('anon', 'public.my_achievable_weekly_pace_kg()', 'execute')
    and has_function_privilege('authenticated', 'public.my_achievable_weekly_pace_kg()', 'execute'),
  'Signed-in users read their own pace; guests without an account may not'
);

select * from finish();
rollback;
