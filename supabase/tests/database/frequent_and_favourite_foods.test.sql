-- Favourites, frequent foods and repeating a meal: each user's own, and only foods that can still
-- be logged.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams)
  values ('Protein pudding', 81, 10, 6, 1.5, 'cup', 200);
create temporary table mine on commit drop as select id from public.custom_foods;
grant select on mine to authenticated;

-- Favourites

insert into public.favourite_foods (food_id) values ('C133000');
insert into public.favourite_foods (custom_food_id) select id from mine;
insert into public.favourite_foods (food_id) values ('B271000');

select throws_ok(
  $$ insert into public.favourite_foods (food_id) values ('C133000') $$,
  '23505',
  null,
  'A food is starred once'
);
select throws_ok(
  $$ insert into public.favourite_foods (food_id, custom_food_id)
     select 'C133000', id from mine $$,
  '23514',
  null,
  'A favourite names one food'
);
select results_eq(
  $$ select custom_food_id is not null, name from public.list_favourite_foods('en') $$,
  $$ values (false, 'Mixed rye bread'), (true, 'Protein pudding'), (false, 'Oat flakes') $$,
  'Favourites list newest first, with names and portions'
);
select results_eq(
  $$ select name from public.list_favourite_foods('de') where food_id = 'C133000' $$,
  $$ values ('Haferflocken') $$,
  'Favourites are named in the language'
);

-- Frequent foods

insert into public.meal_entries (day, meal, food_id, grams, portion_unit, portion_count) values
  (current_date - 2, 'breakfast', 'C133000', 50, 'serving', 1),
  (current_date - 1, 'breakfast', 'C133000', 80, null, null),
  (current_date - 1, 'breakfast', 'B271000', 100, 'serving', 1),
  (current_date, 'lunch', 'C133000', 50, 'serving', 1);
insert into public.meal_entries (day, meal, custom_food_id, grams, portion_unit, portion_count)
  select current_date - 1, 'breakfast', id, 200, 'cup', 1 from mine;

-- Entries from before the 90 days, written past the day check as they were then.
reset role;
set local session_replication_role = replica;
insert into public.meal_entries (user_id, day, meal, food_id, grams) values
  ('00000000-0000-0000-0000-00000000000a', current_date - 91, 'breakfast', 'B101000', 100),
  ('00000000-0000-0000-0000-00000000000a', current_date - 91, 'breakfast', 'B101000', 100),
  ('00000000-0000-0000-0000-00000000000a', current_date - 91, 'breakfast', 'B101000', 100);
set local session_replication_role = origin;
update public.foods set archived_at = now() where id = 'B271000';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select name, times, grams, portion_unit::text from public.frequent_foods('breakfast', 'en') $$,
  $$ values ('Oat flakes', 2, 80.0, null::text), ('Protein pudding', 1, 200.0, 'cup') $$,
  'Frequent foods count the last 90 days of a meal, with the amount logged last'
);
select is_empty(
  $$ select * from public.frequent_foods('dinner', 'en') $$,
  'A meal with nothing logged has no frequent foods'
);
select is_empty(
  $$ select * from public.list_favourite_foods('en') where food_id = 'B271000' $$,
  'A favourite that left the library is not listed'
);

-- Repeating a meal

select is(
  public.repeat_meal(current_date - 1, current_date, 'breakfast'),
  2,
  'Repeating a meal adds the foods that can still be logged'
);
select results_eq(
  $$ select food_id, custom_food_id is not null, grams from public.meal_entries
     where day = current_date and meal = 'breakfast' order by id $$,
  $$ values ('C133000', false, 80.0), (null, true, 200.0) $$,
  'with the same amounts'
);
select is(
  public.repeat_meal(current_date - 5, current_date, 'breakfast'),
  0,
  'A day without the meal adds nothing'
);
select throws_ok(
  $$ select public.repeat_meal(current_date - 1, current_date - 9, 'breakfast') $$,
  'BB020',
  null,
  'A meal is repeated only onto a day that can be logged'
);

-- Other users

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty($$ select * from public.favourite_foods $$, 'Users do not see the favourites of others');
select is_empty(
  $$ select * from public.list_favourite_foods('en') $$,
  'nor list them'
);
select is_empty(
  $$ select * from public.frequent_foods('breakfast', 'en') $$,
  'nor get the frequent foods of others'
);
select is(
  public.repeat_meal(current_date - 1, current_date, 'breakfast'),
  0,
  'nor repeat their meals'
);
select throws_ok(
  $$ insert into public.favourite_foods (custom_food_id) select id from mine $$,
  '42501',
  null,
  'nor star their foods'
);
delete from public.favourite_foods;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::integer from public.favourite_foods),
  3,
  'nor unstar them'
);

delete from public.favourite_foods where food_id = 'C133000';
select is(
  (select count(*)::integer from public.favourite_foods),
  2,
  'Users unstar their own foods'
);

-- Limits and requests without a session

reset role;
insert into public.custom_foods (user_id, name, kcal, protein_g, carbs_g, fat_g)
  select '00000000-0000-0000-0000-00000000000b', 'Food ' || n, 10, 0, 0, 0
  from generate_series(1, 200) n;
insert into public.favourite_foods (user_id, custom_food_id)
  select user_id, id from public.custom_foods
  where user_id = '00000000-0000-0000-0000-00000000000b' order by id limit 199;
insert into public.favourite_foods (user_id, food_id)
  select '00000000-0000-0000-0000-00000000000b', id from public.foods
  where archived_at is null order by id limit 301;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ insert into public.favourite_foods (custom_food_id)
     select max(id) from public.custom_foods $$,
  'BB027',
  null,
  'A user has up to 500 favourites'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select * from public.favourite_foods $$,
  '42501',
  null,
  'Requests without a session cannot read favourites'
);
select throws_ok(
  $$ select public.repeat_meal(current_date - 1, current_date, 'breakfast') $$,
  '42501',
  null,
  'nor repeat a meal'
);

select * from finish();
rollback;
