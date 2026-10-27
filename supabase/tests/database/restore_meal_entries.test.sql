-- Undoing a removal: a removed entry comes back as it was, for its own user, for an hour.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into public.meal_entries (day, meal, food_id, grams, portion_unit, portion_count)
  values (current_date, 'breakfast', 'C133000', 50, 'serving', 1);

create temporary table logged on commit drop as select * from public.meal_entries;
grant select on logged to authenticated;

delete from public.meal_entries;

select throws_ok(
  $$ select * from public.removed_meal_entries $$,
  '42501',
  null,
  'Removed entries are out of reach'
);

-- The food changes and is then taken out of the library.
reset role;
update public.foods set kcal = 1, archived_at = now() where id = 'C133000';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select throws_ok(
  $$ select public.restore_meal_entry((select id from logged)) $$,
  'BB023',
  null,
  'Users cannot restore the entries of others'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ select public.restore_meal_entry((select id from logged)) $$,
  'Users restore their own removed entry, also of a food taken out of the library'
);

select results_eq(
  $$ select id, day, meal, food_id, grams, portion_unit, portion_count, kcal_per_100g, kcal,
       created_at from public.meal_entries $$,
  $$ select id, day, meal, food_id, grams, portion_unit, portion_count, kcal_per_100g, kcal,
       created_at from logged $$,
  'A restored entry has its id, time, amount and copied values'
);

select throws_ok(
  $$ select public.restore_meal_entry((select id from logged)) $$,
  'BB023',
  null,
  'An entry is restored once'
);

select is(
  current_setting('benchbite.restoring_meal_entry', true),
  'off',
  'Restoring leaves new entries to copy their values'
);

-- An entry removed more than an hour ago.
delete from public.meal_entries;
reset role;
update public.removed_meal_entries set removed_at = now() - interval '2 hours'
  where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select throws_ok(
  $$ select public.restore_meal_entry((select id from logged)) $$,
  'BB023',
  null,
  'An entry removed over an hour ago cannot be restored'
);

-- An entry of a day that left the week that can be logged.
reset role;
update public.foods set archived_at = null where id = 'C133000';
update public.removed_meal_entries set removed_at = now(), day = current_date - 9
  where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select throws_ok(
  $$ select public.restore_meal_entry((select id from logged)) $$,
  'BB020',
  null,
  'A restored entry still has to be in the week that can be logged'
);

-- Removing again drops entries removed over an hour ago.
insert into public.meal_entries (day, meal, food_id, grams) values (current_date, 'lunch', 'C133000', 10);
reset role;
update public.removed_meal_entries set removed_at = now() - interval '2 hours'
  where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
delete from public.meal_entries;
reset role;

select is(
  (select count(*)::integer from public.removed_meal_entries
   where user_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'Only the entry removed last is kept'
);

select set_config('role', 'anon', true);

select throws_ok(
  $$ select public.restore_meal_entry(1) $$,
  '42501',
  null,
  'Requests without a session cannot restore'
);

select * from finish();
rollback;
