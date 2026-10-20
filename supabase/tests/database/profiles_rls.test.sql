-- Row level security of the onboarding tables, tested as two signed-in users and as anon.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Acts as the given user, the way PostgREST does for a request with that user's token.
create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- User A saves the onboarding.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$
    insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
      activity_level, experience, training_setup, training_days, session_minutes)
    values ('00000000-0000-0000-0000-00000000000a', 'male', extract(year from current_date) - 30,
      180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60);
    insert into public.goals (user_id, kind) values ('00000000-0000-0000-0000-00000000000a', 'stay_healthy');
    insert into public.weight_entries (user_id, weight_kg) values ('00000000-0000-0000-0000-00000000000a', 80);
    insert into public.health_data_consents (user_id, policy_version)
      values ('00000000-0000-0000-0000-00000000000a', '2026-10-21');
  $$,
  'Users can save their own onboarding'
);

select is(
  public.my_nutrition_targets(),
  -- Three training days raise the moderate activity level to active: 1780 * 1.725 = 3071.
  public.calculate_nutrition_targets('male', 30, 180, 80, 'moderate', 3, 'stay_healthy'),
  'my_nutrition_targets() uses the saved profile, goal and latest weight'
);

select throws_ok(
  $$ update public.profiles set training_days = '{1,2,3,4,5,6,7}' $$,
  '23514',
  null,
  'Profiles allow at most six training days'
);

select throws_ok(
  $$ insert into public.weight_entries (user_id, weight_kg) values ('00000000-0000-0000-0000-00000000000b', 70) $$,
  '42501',
  null,
  'Users cannot add rows for someone else'
);

select throws_ok(
  $$ delete from public.profiles $$,
  '42501',
  null,
  'Users cannot delete their profile directly'
);

select throws_ok(
  $$ update public.health_data_consents set policy_version = 'other' $$,
  '42501',
  null,
  'Consents cannot be changed'
);

select throws_ok(
  $$ insert into public.health_data_consents (user_id, policy_version, granted_at)
     values ('00000000-0000-0000-0000-00000000000a', '2026-10-21', '2000-01-01') $$,
  '42501',
  null,
  'Consents cannot be backdated'
);

-- User B sees and changes nothing of user A.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty($$ select * from public.profiles $$, 'Users cannot read other profiles');
select is_empty($$ select * from public.goals $$, 'Users cannot read other goals');
select is_empty($$ select * from public.weight_entries $$, 'Users cannot read other weight entries');
select is_empty($$ select * from public.health_data_consents $$, 'Users cannot read other consents');
select is(public.my_nutrition_targets(), null, 'my_nutrition_targets() is null without a profile');

select is_empty(
  $$ update public.profiles set height_cm = 150 returning 1 $$,
  'Users cannot update other profiles'
);
select is_empty(
  $$ update public.goals set kind = 'lose_fat' returning 1 $$,
  'Users cannot update other goals'
);

-- Without a session, nothing is accessible.
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.profiles $$, '42501', null, 'Anon cannot read profiles');
select throws_ok(
  $$ select public.my_nutrition_targets() $$,
  '42501',
  null,
  'Anon cannot call my_nutrition_targets()'
);

-- User A's data is unchanged by user B's attempts.
reset role;
select is(
  (select height_cm from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  180.0,
  'Other users left the profile unchanged'
);

select * from finish();
rollback;
