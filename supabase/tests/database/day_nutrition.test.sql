-- day_nutrition() gives what the caller ate on each day of a range, at most a month, against the
-- targets each day kept (ADR 0040, ADR 0046). Only the caller's own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Written as the database, so that each entry holds exactly the values given.
set local session_replication_role = replica;

create function pg_temp.eat(owner uuid, on_day date, grams integer) returns void language sql as $$
  insert into public.meal_entries (user_id, day, meal, food_id, grams, kcal_per_100g,
    protein_per_100g, carbs_per_100g, fat_per_100g)
  values (owner, on_day, 'lunch', (select id from public.foods order by id limit 1), grams, 100, 10,
    10, 5);
$$;

-- User a ate 1,000 kcal three days ago in two entries and 500 yesterday; three days ago kept the
-- targets it had, today follows the ones in use.
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', current_date - 3, 600);
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', current_date - 3, 400);
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', current_date - 1, 500);
insert into public.day_nutrition_targets (user_id, day, calories, protein_g, carbs_g, fat_g)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 3, 1800, 120, 200, 60);
insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g)
  values ('00000000-0000-0000-0000-00000000000a', 2000, 100, 250, 60);
-- User b ate on the same day.
select pg_temp.eat('00000000-0000-0000-0000-00000000000b', current_date - 3, 900);

set local session_replication_role = origin;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select day, kcal, protein_g, carbs_g, fat_g
     from public.day_nutrition(current_date - 3, current_date - 1, current_date) $$,
  $$ values
       (current_date - 3, 1000.0::numeric, 100.0::numeric, 100.0::numeric, 50.0::numeric),
       (current_date - 2, 0::numeric, 0::numeric, 0::numeric, 0::numeric),
       (current_date - 1, 500.0::numeric, 50.0::numeric, 50.0::numeric, 25.0::numeric) $$,
  'Each day of the range sums its own entries, none for a day without them'
);
select results_eq(
  $$ select entries from public.day_nutrition(current_date - 3, current_date - 1, current_date) $$,
  $$ values (2), (0), (1) $$,
  'Each day gives how many entries it has'
);
select results_eq(
  $$ select target_calories, target_protein_g, target_carbs_g, target_fat_g
     from public.day_nutrition(current_date - 3, current_date - 3, current_date) $$,
  $$ values (1800, 120, 200, 60) $$,
  'A past day gives the targets it kept'
);
select results_eq(
  $$ select target_calories from public.day_nutrition(current_date, current_date, current_date) $$,
  $$ values (2000) $$,
  'Today gives the targets in use'
);
select is(
  (select count(*)::integer from public.day_nutrition(current_date - 60, current_date, current_date)),
  31,
  'A range gives at most a month of days'
);
select is(
  (select count(*)::integer from public.day_nutrition(current_date, current_date - 3, current_date)),
  0,
  'A range that ends before it starts gives no days'
);
select throws_ok(
  $$ select * from public.day_nutrition(current_date - 3, current_date, null) $$,
  '22023', null,
  'A missing today is refused'
);
select throws_ok(
  $$ select * from public.day_nutrition(current_date - 3, current_date, current_date + 5) $$,
  '22023', null,
  'A today that is not the device''s today is refused'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select kcal from public.day_nutrition(current_date - 3, current_date - 3, current_date)),
  900.0::numeric,
  'Another user gets only their own entries'
);
select is(
  (select target_calories from public.day_nutrition(current_date, current_date, current_date)),
  null,
  'A user without targets in use gets none'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.day_nutrition(current_date - 3, current_date, current_date) $$,
  '42501', null,
  'Anon gets nothing'
);

select * from finish();
rollback;
