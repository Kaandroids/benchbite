-- Each past day keeps the workouts it was planned with; changing the plan changes today and later
-- days only. Only the database writes them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- How many days a user's plan kept.
create function pg_temp.kept(owner uuid) returns integer language sql as $$
  select count(*)::integer from public.planned_days p where p.user_id = owner;
$$;

-- A and B have trained since two weeks ago (A) and five days ago (B), on every day of the week, so
-- that the tests do not depend on today's weekday. The plan is set up as it was then, without
-- keeping days.
insert into public.planned_days_kept (user_id, through) values
  ('00000000-0000-0000-0000-00000000000a', current_date - 15),
  ('00000000-0000-0000-0000-00000000000b', current_date - 5);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays) overriding system value values
  (901, '00000000-0000-0000-0000-00000000000a', 'Push', 'push', 45, '{1,2,3,4,5,6,7}'),
  (902, '00000000-0000-0000-0000-00000000000b', 'Legs', 'legs', 45, '{1,2,3,4,5,6,7}');
-- A skipped yesterday's Push, and has already skipped tomorrow's.
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values
  ('00000000-0000-0000-0000-00000000000a', 901, current_date - 1, null),
  ('00000000-0000-0000-0000-00000000000a', 901, current_date + 1, null);
set local session_replication_role = origin;

-- ----------------------------------------------------------------------------------------------
-- Keeping the plan before a change

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.keep_planned_days(current_date);

select is(pg_temp.kept('00000000-0000-0000-0000-00000000000a'), 14,
  'The app keeps the plan of every day since the last kept one, up to yesterday');
select results_eq(
  $$ select distinct name, type::text from public.planned_days $$,
  $$ values ('Push', 'push') $$,
  'with the workout''s name and type'
);
select is_empty(
  $$ select * from public.planned_days where day >= current_date $$,
  'Today follows the plan as it is'
);

update public.workouts set active = false where id = 901;
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000a'), 14,
  'Archiving the workout leaves past days planned with it');
select results_eq(
  $$ select from_on - current_date from public.workout_moves order by from_on $$,
  $$ values (-1) $$,
  'and keeps the skip of a past day, while a later one that no longer fits goes'
);

update public.workouts set active = true where id = 901;
select public.keep_planned_days(current_date);
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000a'), 14,
  'A kept day is never written again');

delete from public.workouts where id = 901;
select results_eq(
  $$ select count(*)::integer, count(workout_id)::integer, min(name) from public.planned_days $$,
  $$ values (14, 0, 'Push') $$,
  'Deleting the workout keeps its name on the days it was planned on'
);

-- ----------------------------------------------------------------------------------------------
-- Changes the app did not announce

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
update public.workouts set active = false where id = 902;
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000b'), 4,
  'A change keeps the days before it even when the app did not keep them first');
select is(
  (select through from public.planned_days_kept),
  current_date - 1,
  'up to the server''s yesterday'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$ select public.save_workout(jsonb_build_object('name', 'Pull', 'weekdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
       'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets', 2,
         'target', jsonb_build_object('seconds', 30), 'restSeconds', 45)))) $$,
  'A first workout'
);
select results_eq(
  $$ select (select through from public.planned_days_kept), (select count(*)::integer from public.planned_days) $$,
  $$ values (current_date - 1, 0) $$,
  'starts the plan today: the days before it had none'
);

-- ----------------------------------------------------------------------------------------------
-- The device's today, other users and requests without a session

select throws_ok(
  $$ select public.keep_planned_days(current_date - 3) $$,
  '22023',
  null,
  'Only the device''s today is taken, which is at most a day from the server''s'
);
select throws_ok(
  $$ insert into public.planned_days (user_id, day, name) values ('00000000-0000-0000-0000-00000000000c', current_date, 'Fake') $$,
  '42501',
  null,
  'Only the database writes the planned days'
);
select throws_ok(
  $$ update public.planned_days_kept set through = current_date - 30 $$,
  '42501',
  null,
  'nor how far they are kept'
);
select is_empty(
  $$ select * from public.planned_days where user_id <> '00000000-0000-0000-0000-00000000000c' $$,
  'Users do not see the planned days of others'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.keep_planned_days(current_date) $$,
  '42501',
  null,
  'Requests without a session cannot keep days'
);

select * from finish();
rollback;
