-- Each day keeps the targets in use when its first entry was logged, and follows the targets in
-- use while it is today or later; once it is past it keeps the last ones. Only the database writes
-- them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- A 30-year-old man of 180 cm and 80 kg, moderately active, training three days a week.
insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
  activity_level, experience, training_setup, training_days, session_minutes,
  onboarding_completed_at)
values ('00000000-0000-0000-0000-00000000000a', 'male', extract(year from current_date) - 30,
  180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60, now());
insert into public.goals (user_id, kind) values ('00000000-0000-0000-0000-00000000000a', 'stay_healthy');
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 80, current_date - 1);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The calories a day keeps.
create function pg_temp.kept(on_day date) returns integer language sql as $$
  select d.calories from public.day_nutrition_targets d where d.day = on_day;
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- ----------------------------------------------------------------------------------------------
-- Keeping a day's targets with its first entry

insert into public.own_nutrition_targets (calories, protein_g, carbs_g, fat_g)
  values (2800, 150, 350, 80);
insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date - 1, 'lunch', 'C133000', 100);

select results_eq(
  $$ select day, calories, protein_g, carbs_g, fat_g from public.day_nutrition_targets $$,
  $$ values (current_date - 1, 2800, 150, 350, 80) $$,
  'A day keeps the targets in use when its first entry is logged'
);
select is(
  public.targets_of_day(current_date - 1, current_date),
  row(2800, 150, 350, 80)::public.nutrition_targets,
  'and is measured against them once it is past'
);

-- ----------------------------------------------------------------------------------------------
-- The goal changes during a day (#242): breakfast against 2,800, then 3,100 from noon on

insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date, 'breakfast', 'C133000', 50);
select is(pg_temp.kept(current_date), 2800, 'Today''s first entry keeps 2,800');

update public.own_nutrition_targets set calories = 3100, carbs_g = 425;
select public.refresh_day_nutrition_targets(current_date);
select is(
  pg_temp.kept(current_date),
  3100,
  'A new goal is written over today, which is still under way'
);
select is(
  pg_temp.kept(current_date - 1),
  2800,
  'and leaves yesterday as it was'
);

insert into public.meal_entries (day, meal, food_id, grams) values
  (current_date, 'lunch', 'C133000', 100),
  (current_date, 'dinner', 'C133000', 100);
select is(
  pg_temp.kept(current_date),
  3100,
  'Lunch and dinner logged after it keep the new goal'
);
select is(
  public.targets_of_day(current_date, current_date + 1),
  row(3100, 150, 425, 80)::public.nutrition_targets,
  'so the day, once past, keeps 3,100, as it showed while it lasted'
);
select is(
  public.targets_of_day(current_date, current_date),
  public.my_nutrition_targets(),
  'Today is measured against the targets in use'
);

-- ----------------------------------------------------------------------------------------------
-- A day logged ahead follows too; days before today do not

insert into public.meal_entries (day, meal, food_id, grams)
  values (current_date + 1, 'breakfast', 'C133000', 50);
update public.own_nutrition_targets set calories = 3200, carbs_g = 450;
select public.refresh_day_nutrition_targets(current_date);
select is(pg_temp.kept(current_date + 1), 3200, 'A day logged ahead follows a new goal');
select is(pg_temp.kept(current_date), 3200, 'as today does');
select is(pg_temp.kept(current_date - 1), 2800, 'while yesterday keeps its own');

-- ----------------------------------------------------------------------------------------------
-- Every way the targets in use change: calculated ones, a new weight, a recalculation

update public.own_nutrition_targets set in_use = false;
select public.refresh_day_nutrition_targets(current_date);
select is(
  pg_temp.kept(current_date),
  (public.calculated_nutrition_targets()).calories,
  'Going back to the calculated targets is written over today'
);

reset role;
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 90, current_date);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select isnt(
  pg_temp.kept(current_date),
  (public.calculated_nutrition_targets()).calories,
  'A new weight changes the calculated targets'
);
select public.refresh_day_nutrition_targets(current_date);
select is(
  pg_temp.kept(current_date),
  (public.calculated_nutrition_targets()).calories,
  'and is written over today'
);

select public.recalculate_nutrition_targets('lose_fat', 80, 0.5, 'light');
select public.refresh_day_nutrition_targets(current_date);
select is(
  pg_temp.kept(current_date),
  (public.calculated_nutrition_targets()).calories,
  'as is a recalculated goal'
);
select is(pg_temp.kept(current_date - 1), 2800, 'and yesterday keeps its own through all of it');

-- ----------------------------------------------------------------------------------------------
-- The device's today


select is(
  public.targets_of_day(current_date - 6, current_date),
  public.my_nutrition_targets(),
  'A past day without entries is measured against the targets in use'
);
select is(
  public.targets_of_day(current_date + 1, current_date),
  public.my_nutrition_targets(),
  'as is a day ahead'
);

-- ----------------------------------------------------------------------------------------------
-- Moving, removing and copying entries

update public.meal_entries set day = current_date - 3 where meal = 'dinner';
select is(
  pg_temp.kept(current_date - 3),
  (public.my_nutrition_targets()).calories,
  'An entry moved to a day without targets gives it the ones in use'
);

delete from public.meal_entries where day = current_date - 1;
select is(
  pg_temp.kept(current_date - 1),
  2800,
  'A day keeps its targets when its entries are removed, to be restored'
);

select public.copy_meal_entries(
  array(select e.id from public.meal_entries e where e.day = current_date),
  current_date - 4,
  'snack'
);
select results_eq(
  $$ select count(*)::integer from public.day_nutrition_targets where day = current_date - 4 $$,
  $$ values (1) $$,
  'Copying several entries to a new day keeps its targets once'
);

-- ----------------------------------------------------------------------------------------------
-- Writes, other users and requests without a session

select throws_ok(
  $$ update public.day_nutrition_targets set calories = 9999 $$,
  '42501',
  null,
  'Only the database writes the targets of a day'
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
select lives_ok(
  $$ select public.refresh_day_nutrition_targets(current_date) $$,
  'A user without targets refreshes nothing'
);
-- As user B, so that A's days stay as the tests above left them.
select lives_ok(
  $$ select public.refresh_day_nutrition_targets(current_date - 1) $$,
  'The device''s today may be the server''s yesterday, as time zones differ'
);
select throws_ok(
  $$ select public.refresh_day_nutrition_targets(current_date - 2) $$,
  '22023',
  null,
  'but an earlier day cannot be rewritten'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(pg_temp.kept(current_date - 1), 2800, 'nor anyone else''s days');

select set_config('role', 'anon', true);
select throws_ok(
  $$ select * from public.day_nutrition_targets $$,
  '42501',
  null,
  'Requests without a session cannot read them'
);
select throws_ok(
  $$ select public.refresh_day_nutrition_targets(current_date) $$,
  '42501',
  null,
  'nor refresh them'
);
select throws_ok(
  $$ select public.targets_of_day(current_date, current_date) $$,
  '42501',
  null,
  'nor read a day''s targets'
);

select * from finish();
rollback;
