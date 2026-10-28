-- Recipes: only their owner sees, changes and logs them; a serving's values are summed from the
-- ingredients, and deleting one archives it and keeps the entries that name it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- A food of A's own: 100 kcal, 10 g protein per 100 g.
insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
  values ('Stock', 100, 10, 5, 2);
create temporary table ids on commit drop as
  select 'stock'::text as key, id from public.custom_foods;
grant select, insert on ids to authenticated;

-- Oat flakes, 348 kcal per 100 g: 200 g of them, and 200 g of the stock, make 2 bowls.
insert into ids
  select 'porridge', public.save_recipe(
    null, ' Porridge ', 2::smallint, 'bowl',
    jsonb_build_array(
      jsonb_build_object('food_id', 'C133000', 'grams', 200, 'portion_unit', 'serving',
        'portion_count', 4),
      jsonb_build_object('custom_food_id', (select id from ids where key = 'stock'), 'grams', 200)
    )
  );

select results_eq(
  $$ select name, servings, serving_unit::text from public.recipes $$,
  $$ values ('Porridge', 2::smallint, 'bowl') $$,
  'A recipe is saved with its name trimmed'
);
select results_eq(
  $$ select position, food_id, grams, portion_count from public.recipe_ingredients
     order by position $$,
  $$ values (0::smallint, 'C133000', 200.0, 4.0), (1::smallint, null, 200.0, null) $$,
  'with its ingredients in order'
);
select results_eq(
  $$ select grams, kcal from public.recipe_values $$,
  $$ values (400.0, 224.0) $$,
  'Its values per 100 g are summed from the ingredients'
);
select results_eq(
  $$ select name, portion_unit::text, portion_grams from public.loggable_foods('en')
     where recipe_id is not null $$,
  $$ values ('Porridge', 'bowl', 200.0) $$,
  'A serving is the whole weight shared out'
);

-- Logging a bowl and a half.
insert into public.meal_entries (day, meal, recipe_id, grams, portion_unit, portion_count)
  select current_date, 'breakfast', id, 300, 'bowl', 1.5 from ids where key = 'porridge';

select results_eq(
  $$ select kcal_per_100g, kcal from public.meal_entries $$,
  $$ values (224.0, 672.0) $$,
  'An entry copies the recipe''s values'
);

select results_eq(
  $$ select name, portion_grams from public.search_foods('porridge', 'en')
     where recipe_id is not null $$,
  $$ values ('Porridge', 200.0) $$,
  'Search finds a recipe by its name, with a serving'
);

insert into public.favourite_foods (recipe_id) select id from ids where key = 'porridge';
select results_eq(
  $$ select name from public.list_favourite_foods('en') $$,
  $$ values ('Porridge') $$,
  'A recipe can be a favourite'
);
select results_eq(
  $$ select name, times from public.frequent_foods('breakfast', 'en') $$,
  $$ values ('Porridge', 1) $$,
  'and a frequent food'
);

-- Changing it: one ingredient instead of two.
select is(
  public.save_recipe(
    (select id from ids where key = 'porridge'), 'Porridge', 4::smallint, 'bowl',
    jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 400))
  ),
  (select id from ids where key = 'porridge'),
  'A recipe is changed in place'
);
select results_eq(
  $$ select count(*)::integer, sum(grams) from public.recipe_ingredients $$,
  $$ values (1, 400.0) $$,
  'with its new ingredients only'
);
select results_eq(
  $$ select kcal_per_100g from public.meal_entries $$,
  $$ values (224.0) $$,
  'Past entries keep the values they were logged with'
);

select throws_ok(
  $$ select public.save_recipe(null, 'PORRIDGE', 1::smallint, 'bowl',
       jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 50))) $$,
  '23505',
  null,
  'A user''s recipes have different names'
);
select throws_ok(
  $$ select public.save_recipe(null, 'Nothing', 1::smallint, 'bowl', '[]') $$,
  '22023',
  null,
  'A recipe has at least one ingredient'
);
select throws_ok(
  $$ select public.save_recipe(null, 'Huge', 1::smallint, 'bowl',
       jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 6000))) $$,
  '23514',
  null,
  'An ingredient weighs at most 5,000 g'
);

-- Another user

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty($$ select * from public.recipes $$, 'Users do not see the recipes of others');
select is_empty($$ select * from public.recipe_ingredients $$, 'nor their ingredients');
select throws_ok(
  $$ select public.save_recipe((select id from ids where key = 'porridge'), 'Mine now',
       1::smallint, 'bowl', jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 50))) $$,
  '23503',
  null,
  'nor change them'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, recipe_id, grams)
     select current_date, 'lunch', id, 100 from ids where key = 'porridge' $$,
  '23503',
  null,
  'nor log them'
);
select throws_ok(
  $$ insert into public.favourite_foods (recipe_id) select id from ids where key = 'porridge' $$,
  '42501',
  null,
  'nor star them'
);
select throws_ok(
  $$ select public.save_recipe(null, 'Borrowed', 1::smallint, 'bowl',
       jsonb_build_array(jsonb_build_object('custom_food_id',
         (select id from ids where key = 'stock'), 'grams', 50))) $$,
  '42501',
  null,
  'nor use the foods of others in a recipe'
);

-- Deleting

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

update public.recipes set archived_at = '2000-01-01';
select ok(
  (select archived_at > now() - interval '1 minute' from public.recipes),
  'Deleting a recipe archives it at the server''s time'
);
select throws_ok(
  $$ update public.recipes set name = 'Back again' $$,
  'BB030',
  null,
  'A deleted recipe cannot be changed'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, recipe_id, grams)
     select current_date, 'lunch', id, 100 from ids where key = 'porridge' $$,
  'BB022',
  null,
  'nor logged'
);
select is_empty(
  $$ select * from public.loggable_foods('en') where recipe_id is not null $$,
  'nor offered anywhere'
);

-- Limits and requests without a session

reset role;
insert into public.recipes (user_id, name, servings, serving_unit)
  select '00000000-0000-0000-0000-00000000000b', 'Recipe ' || n, 1, 'bowl'
  from generate_series(1, 100) n;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.save_recipe(null, 'One more', 1::smallint, 'bowl',
       jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 50))) $$,
  'BB028',
  null,
  'A user has up to 100 recipes'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.save_recipe(null, 'Anon', 1::smallint, 'bowl',
       jsonb_build_array(jsonb_build_object('food_id', 'C133000', 'grams', 50))) $$,
  '42501',
  null,
  'Requests without a session cannot save recipes'
);

select * from finish();
rollback;
