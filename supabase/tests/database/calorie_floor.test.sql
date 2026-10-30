-- The calorie floor: the least the targets give, which Bite is told too.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select results_eq(
  $$ select public.calorie_floor(s) from unnest(enum_range(null::public.sex)) s order by s $$,
  $$ select case s when 'male' then 1500 when 'female' then 1200 else 1350 end
     from unnest(enum_range(null::public.sex)) s order by s $$,
  'The floor is 1500 kcal for men, 1200 for women and the midpoint otherwise'
);
-- coach-chat tells Bite the highest floor when the profile cannot be read, and marks targets
-- below the lowest (FLOORS in supabase/functions/coach-chat/prompt.ts).
select results_eq(
  $$ select max(public.calorie_floor(s)), min(public.calorie_floor(s))
     from unnest(enum_range(null::public.sex)) s $$,
  $$ values (1500, 1200) $$,
  'The highest and the lowest floor are those the coach falls back on'
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

select ok(
  not has_function_privilege('anon', 'public.calorie_floor(public.sex)', 'execute')
    and not has_function_privilege('anon', 'public.calorie_floor(public.profiles)', 'execute'),
  'Guests without an account may not'
);

-- A profile reads its floor as a column.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
set local session_replication_role = replica;
insert into public.profiles (user_id, sex, birth_year, height_cm, activity_level, experience,
  training_days, training_setup, session_minutes, height_unit, weight_unit)
values ('00000000-0000-0000-0000-00000000000a', 'female', 1990, 165, 'sedentary', 'beginner',
  '{1}', 'gym', 45, 'cm', 'kg');
set local session_replication_role = origin;
select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(
  (select public.calorie_floor(p) from public.profiles p),
  1200,
  'A profile reads the floor of its sex'
);
select is(
  (select count(*)::integer from public.profiles p where public.calorie_floor(p) = 1200),
  1,
  'as its own row'
);

select * from finish();
rollback;
