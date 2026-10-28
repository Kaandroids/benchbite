-- Each day keeps the targets in use when its first entry was logged: later goals leave it as it
-- was, and only the trigger writes them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
  activity_level, experience, training_setup, training_days, session_minutes,
  onboarding_completed_at)
values ('00000000-0000-0000-0000-00000000000a', 'male', extract(year from current_date) - 30,
  180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60, now());
insert into public.goals (user_id, kind) values ('00000000-0000-0000-0000-00000000000a', 'stay_healthy');
insert into public.weight_entries (user_id, weight_kg) values ('00000000-0000-0000-0000-00000000000a', 80);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- Yesterday, with the goal at 2,800 kcal.
insert into public.own_nutrition_targets (calories, protein_g, carbs_g, fat_g)
  values (2800, 150, 350, 80);
insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date - 1, 'lunch', 'C133000', 100);

select results_eq(
  $$ select day, calories, protein_g from public.day_nutrition_targets $$,
  $$ values (current_date - 1, 2800, 150) $$,
  'A day keeps the targets in use when its first entry is logged'
);

-- Today the goal becomes 3,100 kcal.
update public.own_nutrition_targets set calories = 3100, carbs_g = 425;
insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date - 1, 'dinner', 'C133000', 100);

select results_eq(
  $$ select calories from public.day_nutrition_targets where day = current_date - 1 $$,
  $$ values (2800) $$,
  'A new goal leaves past days as they were, entries logged to them later too'
);

insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date, 'breakfast', 'C133000', 50);
select results_eq(
  $$ select calories from public.day_nutrition_targets where day = current_date $$,
  $$ values (3100) $$,
  'and counts from the next day logged'
);

update public.meal_entries set day = current_date - 2 where meal = 'dinner';
select results_eq(
  $$ select calories from public.day_nutrition_targets where day = current_date - 2 $$,
  $$ values (3100) $$,
  'An entry moved to a day without targets gives it the ones in use'
);

delete from public.meal_entries where day = current_date - 1;
select results_eq(
  $$ select calories from public.day_nutrition_targets where day = current_date - 1 $$,
  $$ values (2800) $$,
  'A day keeps its targets when its entries are removed, to be restored'
);

select throws_ok(
  $$ update public.day_nutrition_targets set calories = 9999 $$,
  '42501',
  null,
  'Only the trigger writes the targets of a day'
);
select throws_ok(
  $$ insert into public.day_nutrition_targets (user_id, day, calories, protein_g, carbs_g, fat_g)
     values ('00000000-0000-0000-0000-00000000000a', current_date - 5, 1, 1, 1, 1) $$,
  '42501',
  null,
  'nor are they added by hand'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ select * from public.day_nutrition_targets $$,
  'Users do not see the targets of others'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select * from public.day_nutrition_targets $$,
  '42501',
  null,
  'Requests without a session cannot read them'
);

select * from finish();
rollback;
