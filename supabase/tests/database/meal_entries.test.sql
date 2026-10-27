-- Logging meals: entries copy the food's nutrients, stay within their limits and belong to their
-- user.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- A food taken out of the library.
update public.foods set archived_at = now() where id = 'B101000';

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- What the app sends: oat flakes, 50 g as one serving.
insert into public.meal_entries (day, meal, food_id, grams, portion_unit, portion_count)
  values ('2026-10-27', 'breakfast', 'C133000', 50, 'serving', 1);

select results_eq(
  $$ select user_id, kcal_per_100g, kcal, protein_g, carbs_g, fat_g from public.meal_entries $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 348.0::numeric, 174.0::numeric,
       6.6::numeric, 26.7::numeric, 3.3::numeric) $$,
  'An entry copies the food''s values and adds up its amount'
);

update public.meal_entries set grams = 80, portion_unit = null, portion_count = null;

select results_eq(
  $$ select kcal from public.meal_entries $$,
  $$ values (278.4::numeric) $$,
  'A changed amount changes what the entry adds'
);

select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams, kcal_per_100g)
     values ('2026-10-27', 'lunch', 'C133000', 50, 1) $$,
  '42501',
  null,
  'The copied values cannot be sent'
);
select throws_ok(
  $$ update public.meal_entries set kcal_per_100g = 1 $$,
  '42501',
  null,
  'The copied values cannot be changed'
);
select throws_ok(
  $$ update public.meal_entries set food_id = 'C133000' $$,
  '42501',
  null,
  'An entry cannot change its food'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values (current_date + 2, 'lunch', 'C133000', 50) $$,
  'BB020',
  null,
  'A future day is rejected'
);
select lives_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values (current_date + 1, 'lunch', 'C133000', 50) $$,
  'The next day is allowed for time zones ahead of the server'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values ('2026-10-27', 'lunch', 'B101000', 50) $$,
  'BB022',
  null,
  'An archived food cannot be logged'
);
select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams, portion_unit)
     values ('2026-10-27', 'lunch', 'C133000', 50, 'serving') $$,
  '23514',
  null,
  'A portion needs its count'
);

insert into public.meal_entries (day, meal, food_id, grams)
  select '2026-10-26', 'snack', 'C133000', 10 from generate_series(1, 100);

select throws_ok(
  $$ insert into public.meal_entries (day, meal, food_id, grams)
     values ('2026-10-26', 'snack', 'C133000', 10) $$,
  'BB021',
  null,
  'A day has up to 100 entries'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty(
  $$ select * from public.meal_entries $$,
  'Users do not see the entries of others'
);

update public.meal_entries set grams = 1;
delete from public.meal_entries;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select count(*)::integer, min(grams) from public.meal_entries $$,
  $$ values (102, 10.0::numeric) $$,
  'Users cannot change or delete the entries of others'
);

select lives_ok(
  $$ delete from public.meal_entries where day = '2026-10-26' $$,
  'Users delete their own entries'
);

select set_config('role', 'anon', true);

select throws_ok(
  $$ select * from public.meal_entries $$,
  '42501',
  null,
  'Guests without a session cannot read entries'
);

select * from finish();
rollback;
