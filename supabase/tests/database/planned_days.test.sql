-- Each past day keeps the workouts it was planned with; changing the plan changes today and later
-- days only. Only the database writes them, and planned_workouts() reads them with the plan.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- How many days a user's plan kept.
create function pg_temp.kept(owner uuid) returns integer language sql as $$
  select count(*)::integer from public.planned_days p where p.user_id = owner;
$$;

-- The last day a user's plan is kept through.
create function pg_temp.through(owner uuid) returns date language sql as $$
  select k.through from public.planned_days_kept k where k.user_id = owner;
$$;

-- A and B have trained since two weeks ago (A) and five days ago (B), on every day of the week, so
-- that the tests do not depend on today's weekday. The plan is set up as it was then, without
-- keeping days.
insert into public.planned_days_kept (user_id, through) values
  ('00000000-0000-0000-0000-00000000000a', current_date - 15),
  ('00000000-0000-0000-0000-00000000000b', current_date - 5);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value values
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

reset role;
select public.keep_user_planned_days('00000000-0000-0000-0000-00000000000a', current_date - 10);
select is(pg_temp.through('00000000-0000-0000-0000-00000000000a'), current_date - 1,
  'nor does the last kept day move back, as when two calls overlap');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

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
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000b'), 3,
  'A change keeps the days before it even when the app did not keep them first');
select is(pg_temp.through('00000000-0000-0000-0000-00000000000b'), current_date - 2,
  'up to the day before the server''s yesterday, so that a device a day behind still changes its today');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$ select public.save_workout(jsonb_build_object('name', 'Pull',
       'weekdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
       'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets', 2,
         'target', jsonb_build_object('seconds', 30), 'restSeconds', 45)))) $$,
  'A first workout'
);
select results_eq(
  $$ select (select through from public.planned_days_kept), (select count(*)::integer from public.planned_days) $$,
  $$ values (current_date - 2, 0) $$,
  'starts the plan without earlier days: their plan is not known'
);

-- ----------------------------------------------------------------------------------------------
-- Moves into days that follow the plan

-- D's plan is kept into next week, so that its moves can lie in one week on any weekday: Push on
-- Monday and Tuesday, moved from Monday to Tuesday (both kept) and from Tuesday to Thursday.
reset role;
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-00000000000d', date_trunc('week', current_date + 7)::date + 1);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value values
  (904, '00000000-0000-0000-0000-00000000000d', 'Push', 'push', 45, '{1,2}');
insert into public.workout_moves (user_id, workout_id, from_on, to_on)
select '00000000-0000-0000-0000-00000000000d', 904, monday + from_day, monday + to_day
from (select date_trunc('week', current_date + 7)::date as monday) w,
  (values (0, 1), (1, 3)) m (from_day, to_day);
set local session_replication_role = origin;

update public.workouts set weekdays = '{1,2,4}' where id = 904;
select results_eq(
  $$ select extract(isodow from from_on)::integer from public.workout_moves where workout_id = 904 $$,
  $$ values (1) $$,
  'A move into a day that is now the workout''s own goes, while one within kept days stays'
);
insert into public.workout_moves (user_id, workout_id, from_on, to_on)
select '00000000-0000-0000-0000-00000000000d', 904, monday + 1, monday + 4
from (select date_trunc('week', current_date + 7)::date as monday) w;
update public.workouts set active = false where id = 904;
select results_eq(
  $$ select extract(isodow from from_on)::integer from public.workout_moves where workout_id = 904 $$,
  $$ values (1) $$,
  'as does a move of an archived workout out of the kept days'
);

-- ----------------------------------------------------------------------------------------------
-- Reading a day's plan

-- E finished the onboarding five days ago. Days up to four days ago were kept with Old; the plan
-- is New now, on every day.
insert into public.profiles (user_id, sex, birth_year, height_cm, weight_unit, height_unit,
  activity_level, experience, training_setup, training_days, session_minutes,
  onboarding_completed_at)
values ('00000000-0000-0000-0000-00000000000e', 'male', extract(year from current_date) - 30,
  180, 'kg', 'cm', 'moderate', 'beginner', 'gym', '{1,3,5}', 60, now() - interval '5 days');
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-00000000000e', current_date - 4);
insert into public.planned_days (user_id, day, name, type)
select '00000000-0000-0000-0000-00000000000e', current_date - days, 'Old', 'push'
from generate_series(4, 5) days;
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value values
  (905, '00000000-0000-0000-0000-00000000000e', 'New', 'legs', 45, '{1,2,3,4,5,6,7}');
set local session_replication_role = origin;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000e');
select results_eq(
  $$ select day - current_date, name from public.planned_workouts(current_date - 7, current_date + 1, current_date) $$,
  $$ values (-5, 'Old'), (-4, 'Old'), (-3, 'New'), (-2, 'New'), (-1, 'New'), (0, 'New'), (1, 'New') $$,
  'A day''s plan is the one it kept, later days follow the plan, and days before the onboarding have none'
);
select results_eq(
  $$ select name from public.planned_workouts(current_date - 4, current_date - 4, current_date - 4) $$,
  $$ values ('New') $$,
  'From the device''s today on, days follow the plan, whatever the server kept'
);

-- ----------------------------------------------------------------------------------------------
-- Deleting a user

reset role;
-- C's plan is kept through nine days ago only, so that deleting C's workout would keep days.
update public.planned_days_kept set through = current_date - 9
where user_id = '00000000-0000-0000-0000-00000000000c';
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-00000000000c' $$,
  'A user with workouts and days not yet kept can be deleted'
);
select is_empty(
  $$ select * from public.planned_days_kept where user_id = '00000000-0000-0000-0000-00000000000c' $$,
  'and their kept days go with them'
);

-- ----------------------------------------------------------------------------------------------
-- The device's today, other users and requests without a session

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000d');
select throws_ok(
  $$ select public.keep_planned_days(current_date - 3) $$,
  '22023',
  null,
  'Only the device''s today is taken, which is at most a day from the server''s'
);
select throws_ok(
  $$ select public.keep_user_planned_days('00000000-0000-0000-0000-00000000000a', current_date) $$,
  '42501',
  null,
  'Users cannot keep anyone''s days but through keep_planned_days()'
);
select throws_ok(
  $$ insert into public.planned_days (user_id, day, name) values ('00000000-0000-0000-0000-00000000000d', current_date, 'Fake') $$,
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
  $$ select * from public.planned_days where user_id <> '00000000-0000-0000-0000-00000000000d' $$,
  'Users do not see the planned days of others'
);
select is_empty(
  $$ select * from public.planned_days_kept where user_id <> '00000000-0000-0000-0000-00000000000d' $$,
  'nor how far theirs are kept'
);
select is_empty(
  $$ select * from public.planned_workouts(current_date - 7, current_date + 1, current_date) where name <> 'Push' $$,
  'nor read their plan'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.keep_planned_days(current_date) $$,
  '42501',
  null,
  'Requests without a session cannot keep days'
);
select throws_ok(
  $$ select * from public.planned_days $$,
  '42501',
  null,
  'nor read the planned days'
);
select throws_ok(
  $$ select * from public.planned_days_kept $$,
  '42501',
  null,
  'nor how far they are kept'
);

select * from finish();
rollback;
