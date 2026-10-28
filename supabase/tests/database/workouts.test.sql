-- Users switch their own workouts on and off, change nothing else about them yet, and cannot touch
-- other users' workouts. Weekdays are optional but must be real, distinct days.
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

-- Written as the table owner, as users cannot create workouts directly yet.
insert into public.workouts (user_id, weekdays, type, estimated_minutes) values
  ('00000000-0000-0000-0000-00000000000a', '{1}', 'push', 45),
  ('00000000-0000-0000-0000-00000000000b', '{1}', 'pull', 45);

select lives_ok(
  $$ insert into public.workouts (user_id, weekdays, type, estimated_minutes)
     values ('00000000-0000-0000-0000-00000000000a', '{}', 'legs', 30) $$,
  'A workout can have no weekdays'
);
select lives_ok(
  $$ insert into public.workouts (user_id, weekdays, type, estimated_minutes)
     values ('00000000-0000-0000-0000-00000000000a', '{2,5}', 'full_body', 60) $$,
  'A workout can be on several weekdays'
);
select throws_ok(
  $$ insert into public.workouts (user_id, weekdays, type, estimated_minutes)
     values ('00000000-0000-0000-0000-00000000000a', '{8}', 'push', 45) $$,
  '23514', null,
  'Weekdays outside Monday to Sunday are rejected'
);
select throws_ok(
  $$ insert into public.workouts (user_id, weekdays, type, estimated_minutes)
     values ('00000000-0000-0000-0000-00000000000a', '{3,3}', 'push', 45) $$,
  '23514', null,
  'A weekday cannot be repeated'
);
select is(
  (
    select bool_and(active) from public.workouts
    where user_id = '00000000-0000-0000-0000-00000000000a'
  ),
  true,
  'New workouts are active'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ select public.set_workout_active(w.id, false, current_date)
     from public.workouts w where w.type = 'push' $$,
  'Users can switch their own workout off'
);
select is(
  (
    select active from public.workouts
    where user_id = '00000000-0000-0000-0000-00000000000a' and type = 'push'
  ),
  false,
  'The workout is inactive'
);
select throws_ok(
  $$ update public.workouts set estimated_minutes = 10 $$,
  '42501', null,
  'Users change workouts only through the functions'
);

-- Another user's workout is not theirs to switch.
reset role;
select set_config('test.pull_id', (select id::text from public.workouts where type = 'pull'), true);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.set_workout_active(current_setting('test.pull_id')::bigint, false, current_date) $$,
  'BB006', null,
  'Users cannot switch another user''s workout off'
);
reset role;
select is(
  (
    select active from public.workouts
    where user_id = '00000000-0000-0000-0000-00000000000b'
  ),
  true,
  'Users cannot switch another user''s workout'
);

select * from finish();
rollback;
