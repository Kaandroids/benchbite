-- Water: one total per user and day, changed only by add_water(), within its limits.
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

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select is(public.add_water(current_date, 250), 250, 'A first glass starts the day');
select is(public.add_water(current_date, 250), 500, 'Glasses add up');
select is(public.add_water(current_date, -250), 250, 'A glass can be taken away');
select is(public.add_water(current_date, -1000), 0, 'The total does not go below nothing');
select is(public.add_water(current_date, 10000), 10000, 'Up to 10 L');
select is(public.add_water(current_date, 250), 10000, 'And no further');

select throws_ok(
  $$ select public.add_water(current_date - 9, 250) $$,
  'BB020',
  null,
  'Water is logged for today and the week before'
);
select throws_ok(
  $$ insert into public.water_days (day, ml) values (current_date - 1, 250) $$,
  '42501',
  null,
  'The total changes only through add_water()'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty($$ select * from public.water_days $$, 'Users do not see the water of others');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ update public.profiles set water_goal_ml = 2500 where user_id = auth.uid() $$,
  'Users change their own water goal'
);

select set_config('role', 'anon', true);

select throws_ok(
  $$ select public.add_water(current_date, 250) $$,
  '42501',
  null,
  'Requests without a session cannot log water'
);

select * from finish();
rollback;
