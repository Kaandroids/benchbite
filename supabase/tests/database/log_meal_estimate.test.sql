-- A meal estimated from photos is logged in one step: found foods by their id, and items the
-- library did not have as the user's own foods, which are used again by name. Undo takes it back
-- in one step.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  values ('Mango chutney', 220, 0.5, 55, 0.3);

create temporary table logged on commit drop as
  select * from public.log_meal_estimate(
    current_date, 'lunch',
    jsonb_build_array(
      jsonb_build_object('food_id', 'C133000', 'grams', 50),
      -- Named as the food of A's own, which is used, whatever the case.
      jsonb_build_object('name', 'mango chutney', 'grams', 20, 'kcal', 233.3, 'protein_g', 0.5,
        'carbs_g', 57, 'fat_g', 0.3),
      jsonb_build_object('name', ' Dal makhani ', 'grams', 250, 'kcal', 140, 'protein_g', 6,
        'carbs_g', 14, 'fat_g', 7),
      -- Twice in one estimate: made once.
      jsonb_build_object('name', 'Dal makhani', 'grams', 50, 'kcal', 140, 'protein_g', 6,
        'carbs_g', 14, 'fat_g', 7)
    )
  );
grant select on logged to authenticated;

select is((select count(*)::integer from logged), 4, 'Each item gives its entry');
select results_eq(
  $$ select e.food_id, c.name, e.grams, e.meal::text from public.meal_entries e
     left join public.custom_foods c on c.id = e.custom_food_id order by e.id $$,
  $$ values ('C133000', null, 50.0, 'lunch'), (null, 'Mango chutney', 20.0, 'lunch'),
       (null, 'Dal makhani', 250.0, 'lunch'), (null, 'Dal makhani', 50.0, 'lunch') $$,
  'logged to the meal at their grams'
);
select results_eq(
  $$ select created_food from logged order by entry_id $$,
  $$ values (false), (false), (true), (false) $$,
  'An own food of the same name is used, and one is made only once'
);
select results_eq(
  $$ select kcal, protein_g, carbs_g, fat_g from public.custom_foods where name = 'Dal makhani' $$,
  $$ values (140.0, 6.00, 14.00, 7.00) $$,
  'A new food has the values per 100 g it was given, its name trimmed'
);
select is(
  (select kcal_per_100g from public.meal_entries e
   join logged l on l.entry_id = e.id where l.custom_food_id = (
     select id from public.custom_foods where name = 'Mango chutney')),
  220.0,
  'An existing own food keeps its values'
);
select is(
  (select custom_food_id from logged order by entry_id limit 1),
  null,
  'A library food names no food of one''s own'
);
select results_eq(
  $$ select kcal from logged order by entry_id $$,
  $$ values (174.0), (44.0), (350.0), (70.0) $$,
  'Each entry gives the calories it was logged with, an existing own food''s included'
);

-- Values that break a food's checks are made to fit: macros over 100 g are shared down, and
-- calories below what they make are raised.
select lives_ok(
  $$ select public.log_meal_estimate(current_date, 'snack', jsonb_build_array(
       jsonb_build_object('name', 'Nut butter', 'grams', 30, 'kcal', 300, 'protein_g', 30,
         'carbs_g', 30, 'fat_g', 60))) $$,
  'Values a food could not have are logged'
);
select results_eq(
  $$ select protein_g + carbs_g + fat_g <= 100,
       kcal >= 4 * protein_g + 4 * carbs_g + 9 * fat_g
     from public.custom_foods where name = 'Nut butter' $$,
  $$ values (true, true) $$,
  'once made to fit'
);

-- All or nothing.
select throws_ok(
  $$ select public.log_meal_estimate(current_date, 'dinner', jsonb_build_array(
       jsonb_build_object('name', 'Paneer tikka', 'grams', 100, 'kcal', 250, 'protein_g', 15,
         'carbs_g', 5, 'fat_g', 18),
       jsonb_build_object('food_id', 'NOPE', 'grams', 50))) $$,
  '23503'
);
select is(
  (select count(*)::integer from public.custom_foods where name = 'Paneer tikka'),
  0,
  'An estimate that cannot be logged whole logs nothing'
);
select throws_ok(
  $$ select public.log_meal_estimate(current_date, 'dinner', '[]'::jsonb) $$,
  '22023'
);

-- Undo: the entries go, with no copy kept to restore; a food the meal made goes when nothing
-- else names it, and is archived when something does.
insert into public.meal_entries (day, meal, custom_food_id, grams)
  select current_date, 'snack', id, 10 from public.custom_foods where name = 'Nut butter';
create temporary table nut on commit drop as
  select l.entry_id, l.custom_food_id from public.log_meal_estimate(current_date, 'snack',
    jsonb_build_array(jsonb_build_object('name', 'Kimchi', 'grams', 50, 'kcal', 20,
      'protein_g', 1.5, 'carbs_g', 2.5, 'fat_g', 0.5))) l
  union all
  select e.id, e.custom_food_id from public.meal_entries e
  join public.custom_foods c on c.id = e.custom_food_id
  where c.name = 'Nut butter' and e.grams = 30;
grant select on nut to authenticated;

select lives_ok(
  $$ select public.undo_meal_estimate(
       (select array_agg(entry_id) from nut), (select array_agg(custom_food_id) from nut)) $$,
  'An estimate is undone'
);
select is(
  (select count(*)::integer from public.meal_entries where id in (select entry_id from nut)),
  0,
  'Its entries are removed'
);
-- Which users cannot read.
reset role;
select is(
  (select count(*)::integer from public.removed_meal_entries
   where id in (select entry_id from nut)),
  0,
  'and not kept to be restored'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::integer from public.custom_foods where name = 'Kimchi'),
  0,
  'A food it made that nothing else names is deleted'
);
select isnt(
  (select archived_at from public.custom_foods where name = 'Nut butter'),
  null,
  'one that another entry names is archived'
);

-- B cannot log A's food or recipe, nor undo A's meal.
create temporary table porridge on commit drop as
  select public.save_recipe(null, 'Porridge', 1::smallint, 'bowl',
    jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 50))) as id;
grant select on porridge to authenticated;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format(
    $$ select public.log_meal_estimate(current_date, 'lunch', jsonb_build_array(
         jsonb_build_object('custom_food_id', %s, 'grams', 20))) $$,
    (select custom_food_id from logged where custom_food_id is not null limit 1)
  ),
  '23503'
);
select throws_ok(
  format(
    $$ select public.log_meal_estimate(current_date, 'lunch', jsonb_build_array(
         jsonb_build_object('recipe_id', %s, 'grams', 20))) $$,
    (select id from porridge)
  ),
  '23503'
);
select public.undo_meal_estimate(
  (select array_agg(entry_id) from logged), (select array_agg(custom_food_id) from logged)
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::integer from public.meal_entries where id in (select entry_id from logged)),
  4,
  'Another user''s undo leaves the meal'
);
select is(
  (select count(*)::integer from public.custom_foods where name = 'Dal makhani'),
  1,
  'and its foods'
);

-- Signed-in users only.
select ok(
  not has_function_privilege('anon', 'public.log_meal_estimate(date, public.meal, jsonb)',
    'execute')
    and not has_function_privilege('anon', 'public.undo_meal_estimate(bigint[], bigint[])',
      'execute')
    and not has_function_privilege('anon',
      'public.fitted_food_values(numeric, numeric, numeric, numeric)', 'execute'),
  'Anon may not log or undo an estimate'
);
select ok(
  has_function_privilege('authenticated', 'public.undo_meal_estimate(bigint[], bigint[])',
    'execute'),
  'Signed-in users may undo one'
);

select * from finish();
rollback;
