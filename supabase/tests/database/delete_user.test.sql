-- Deleting a user takes all that is theirs, whatever they have (ADR 0087), and leaves another's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (key text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;
create temporary table made (id text) on commit drop;
grant select, insert on made to authenticated;

-- A has what could stand in the way: a food in a recipe, entries and stars of both, a custom
-- exercise in a workout that waits, and a chat.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

with food as (
  insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  values ('Own oats', 380, 12, 60, 7) returning id
)
insert into ids select 'food', id from food;
with recipe as (
  insert into public.recipes (name, servings, serving_unit) values ('Porridge', 1, 'bowl')
  returning id
)
insert into ids select 'recipe', id from recipe;
insert into public.recipe_ingredients (recipe_id, position, custom_food_id, grams)
select (select id from ids where key = 'recipe'), 0, (select id from ids where key = 'food'), 80;
insert into public.meal_entries (day, meal, custom_food_id, grams)
select current_date, 'lunch', id, 100 from ids where key = 'food';
insert into public.meal_entries (day, meal, recipe_id, grams)
select current_date, 'breakfast', id, 100 from ids where key = 'recipe';
insert into public.favourite_foods (custom_food_id) select id from ids where key = 'food';
insert into public.favourite_foods (recipe_id) select id from ids where key = 'recipe';
-- One entry removed, whose copy is kept for an hour and names the food.
insert into public.meal_entries (day, meal, custom_food_id, grams)
select current_date, 'dinner', id, 50 from ids where key = 'food';
delete from public.meal_entries where meal = 'dinner';
insert into made select public.create_exercise(jsonb_build_object(
  'name', 'Own lift', 'metrics', jsonb_build_array('weight', 'reps'),
  'primaryMuscles', jsonb_build_array('glutes'), 'secondaryMuscles', jsonb_build_array('hamstrings'),
  'equipment', 'machine', 'level', 'intermediate', 'instructions', jsonb_build_array('Lift.')
));

reset role;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays, active)
overriding system value values
  (901, '00000000-0000-0000-0000-00000000000a', 'Waits', 30, '{}', true),
  (902, '00000000-0000-0000-0000-00000000000b', 'Stays', 30, '{}', true);
insert into public.workout_exercises (
  workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max, rest_seconds
)
select 901, '00000000-0000-0000-0000-00000000000a', 0, id, 3, 8, 10, 90 from made;
insert into public.workout_exercises (
  workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max, rest_seconds
)
values (902, '00000000-0000-0000-0000-00000000000b', 0, 'Barbell_Squat', 3, 8, 10, 90);
update public.workouts set held = true where id = 901;

-- While A exists nothing of this changes: undoing a meal estimate relies on the foreign key to
-- leave a food that a recipe holds, and a workout that waits stays as it is.
select throws_ok(
  format('delete from public.custom_foods where id = %s', (select id from ids where key = 'food')),
  '23503', null, 'A recipe still keeps its food from being deleted'
);
select throws_ok(
  $$ delete from public.workout_exercises where workout_id = 901 $$,
  'BB051', null, 'and a workout that waits keeps its exercises'
);

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-00000000000a' $$,
  'A user is deleted with all of that'
);

select is((select count(*)::integer from public.custom_foods where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'Their foods go');
select is((select count(*)::integer from public.recipes where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'their recipes');
select is((select count(*)::integer from public.recipe_ingredients
   where recipe_id = (select id from ids where key = 'recipe')), 0,
  'and ingredients');
select is((select count(*)::integer from public.meal_entries where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'their entries');
select is((select count(*)::integer from public.removed_meal_entries where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'and removed ones');
select is(
  (select count(*)::integer from public.exercises where id = (select id from made)), 0,
  'their exercises'
);
select results_eq(
  $$ select id from public.workouts where user_id is not null and id in (901, 902) order by id $$,
  $$ values (902::bigint) $$,
  'and workouts, while another''s stays'
);
select is(
  (select count(*)::integer from public.coach_media_deletions
   where user_id = '00000000-0000-0000-0000-00000000000a'), 1,
  'The folder of their chat waits to be emptied'
);

-- A token outlives its user.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('exercise-photos', '00000000-0000-0000-0000-00000000000a/late.jpg') $$,
  '42501', null, 'A deleted user''s token uploads no photo'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('exercise-photos', '00000000-0000-0000-0000-00000000000b/sub/x.jpg') $$,
  '42501', null, 'Photos sit directly in the user''s folder, where deleting finds them'
);

select * from finish();
rollback;
