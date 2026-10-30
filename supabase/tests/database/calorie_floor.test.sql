-- The calorie floor: the least the targets give, which Bite is told too.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select results_eq(
  $$ select public.calorie_floor(s) from unnest(enum_range(null::public.sex)) s order by s $$,
  $$ select case s when 'male' then 1500 when 'female' then 1200 else 1350 end
     from unnest(enum_range(null::public.sex)) s order by s $$,
  'The floor is 1500 kcal for men, 1200 for women and the midpoint otherwise'
);
select is(
  (public.calculate_nutrition_targets(
    sex => 'female', age => 30, height_cm => 150, weight_kg => 45,
    activity_level => 'sedentary', training_days_per_week => 0, goal => 'lose_fat',
    weekly_pace_kg => 1
  )).calories,
  1200,
  'The targets keep to it'
);
select ok(
  has_function_privilege('authenticated', 'public.calorie_floor(public.sex)', 'execute'),
  'Signed-in users may read it, as the coach does'
);

select * from finish();
rollback;
