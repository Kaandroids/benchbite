-- Water: one total per user and day, changed only by add_water(), within its limits.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

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

select throws_ok(
  $$ update public.water_days set ml = 0 $$,
  '42501',
  null,
  'The total cannot be changed directly'
);
select throws_ok(
  $$ delete from public.water_days $$,
  '42501',
  null,
  'A day cannot be deleted directly'
);

-- A's profile, whose goal B tries to change.
reset role;
insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
  activity_level, experience, training_setup, training_days, session_minutes,
  onboarding_completed_at)
values ('00000000-0000-0000-0000-00000000000a', 'male', extract(year from current_date) - 30,
  180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60, now());

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty($$ select * from public.water_days $$, 'Users do not see the water of others');

update public.profiles set water_goal_ml = 6000
  where user_id = '00000000-0000-0000-0000-00000000000a';

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select water_goal_ml from public.profiles where user_id = auth.uid() $$,
  $$ values (2000) $$,
  'Others cannot change a user''s water goal'
);
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
select throws_ok(
  $$ select * from public.water_days $$,
  '42501',
  null,
  'Requests without a session cannot read water'
);

select * from finish();
rollback;
