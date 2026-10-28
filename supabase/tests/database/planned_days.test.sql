-- Each past day keeps the workouts it was planned with; changing the plan changes today and later
-- days only. Only the database writes them, and planned_workouts() reads them with the plan.
begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

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

select public.set_workout_active(901, false, current_date);
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000a'), 14,
  'Archiving the workout leaves past days planned with it');
select results_eq(
  $$ select from_on - current_date from public.workout_moves order by from_on $$,
  $$ values (-1) $$,
  'and keeps the skip of a past day, while a later one that no longer fits goes'
);

select public.set_workout_active(901, true, current_date);
select public.keep_planned_days(current_date);
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000a'), 14,
  'A kept day is never written again');

reset role;
select public.keep_user_planned_days('00000000-0000-0000-0000-00000000000a', current_date - 10);
select is(pg_temp.through('00000000-0000-0000-0000-00000000000a'), current_date - 1,
  'nor does the last kept day move back, as when two calls overlap');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select public.delete_workout(901, current_date);
select results_eq(
  $$ select count(*)::integer, count(*) filter (where workout_id = 901)::integer, min(name) from public.planned_days $$,
  $$ values (14, 14, 'Push') $$,
  'Deleting the workout keeps its id and name on the days it was planned on'
);
select results_eq(
  $$ select workout_id, from_on - current_date, to_on from public.workout_moves $$,
  $$ values (901::bigint, -1, null::date) $$,
  'and keeps the skip of a kept day with it, so that the day does not turn missed'
);

-- ----------------------------------------------------------------------------------------------
-- The functions that change the plan keep the days before the device's today first

reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a8', 'h@example.com');
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-0000000000a8', current_date - 8);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value values
  (908, '00000000-0000-0000-0000-0000000000a8', 'Core', 'full_body', 20, '{1,2,3,4,5,6,7}');
set local session_replication_role = origin;

select pg_temp.sign_in('00000000-0000-0000-0000-0000000000a8');
select public.save_workout(
  jsonb_build_object('id', 908, 'name', 'Core', 'weekdays', jsonb_build_array(1),
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets', 2,
      'target', jsonb_build_object('seconds', 30), 'restSeconds', 45))),
  current_date
);
select results_eq(
  $$ select (select through from public.planned_days_kept), (select count(*)::integer from public.planned_days) $$,
  $$ values (current_date - 1, 7) $$,
  'Saving a workout with the device''s today keeps the days before it with the plan they had'
);
select public.set_workout_active(908, false, current_date + 1);
select is(pg_temp.through('00000000-0000-0000-0000-0000000000a8'), current_date,
  'as does archiving it, from a device a day ahead'
);
select throws_ok(
  $$ select public.delete_workout(908, current_date + 2) $$,
  '22023',
  null,
  'A day that cannot be the device''s today changes nothing'
);
select lives_ok(
  $$ select public.delete_workout(908, current_date) $$,
  'Deleting it keeps the days too'
);
select throws_ok(
  $$ select public.set_workout_active(901, true, current_date) $$,
  'BB006',
  null,
  'Nobody archives or deletes the workouts of others'
);

-- ----------------------------------------------------------------------------------------------
-- Changes outside the functions

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ update public.workouts set active = false where id = 902 $$,
  '42501',
  null,
  'Users change the plan only through the functions that keep the days first'
);
select throws_ok(
  $$ delete from public.workouts where id = 902 $$,
  '42501',
  null,
  'nor delete a workout directly'
);
reset role;
update public.workouts set active = false where id = 902;
select is(pg_temp.kept('00000000-0000-0000-0000-00000000000b'), 3,
  'A change made any other way keeps the days before it all the same');
select is(pg_temp.through('00000000-0000-0000-0000-00000000000b'), current_date - 2,
  'up to the day before the server''s yesterday, so that a device a day behind still changes its today');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$ select public.save_workout(jsonb_build_object('name', 'Pull',
       'weekdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
       'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets', 2,
         'target', jsonb_build_object('seconds', 30), 'restSeconds', 45))), current_date) $$,
  'A first workout'
);
select results_eq(
  $$ select (select through from public.planned_days_kept), (select count(*)::integer from public.planned_days) $$,
  $$ values (current_date - 1, 0) $$,
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
  $$ select extract(isodow from from_on)::integer, extract(isodow from to_on)::integer
     from public.workout_moves where workout_id = 904 order by from_on $$,
  $$ values (1, 2), (2, null) $$,
  'A move from a kept day into one that is now the workout''s own becomes a skip, so the kept day stays as it went; one within kept days stays'
);
update public.workout_moves set to_on = monday + 4
from (select date_trunc('week', current_date + 7)::date as monday) w
where workout_id = 904 and to_on is null;
insert into public.workout_moves (user_id, workout_id, from_on, to_on)
select '00000000-0000-0000-0000-00000000000d', 904, monday + 7, null
from (select date_trunc('week', current_date + 7)::date as monday) w;
update public.workouts set active = false where id = 904;
select results_eq(
  $$ select extract(isodow from from_on)::integer, extract(isodow from to_on)::integer
     from public.workout_moves where workout_id = 904 order by from_on $$,
  $$ values (1, 2), (2, null) $$,
  'Archiving it turns a move from a kept day into a skip too, and drops those of later days'
);

-- G did Friday's Push early, on a Tuesday now kept: the move goes back into a kept day, which
-- shows the workout only through it.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'g@example.com');
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-0000000000a7', date_trunc('week', current_date + 7)::date + 1);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value values
  (907, '00000000-0000-0000-0000-0000000000a7', 'Push', 'push', 45, '{5}');
insert into public.workout_moves (user_id, workout_id, from_on, to_on)
select '00000000-0000-0000-0000-0000000000a7', 907, monday + 4, monday + 1
from (select date_trunc('week', current_date + 7)::date as monday) w;
set local session_replication_role = origin;

update public.workouts set weekdays = '{3}' where id = 907;
update public.workouts set active = false where id = 907;
delete from public.workouts where id = 907;
select results_eq(
  $$ select workout_id, extract(isodow from from_on)::integer, extract(isodow from to_on)::integer
     from public.workout_moves where user_id = '00000000-0000-0000-0000-0000000000a7' $$,
  $$ values (907::bigint, 5, 2) $$,
  'A move into a kept day stays when the workout loses its day, is archived or is deleted'
);

-- ----------------------------------------------------------------------------------------------
-- Moving from a kept day

-- I's Push was on Tuesdays last week, as Tuesday kept; it is on Thursdays now. Seen on last week's
-- Wednesday, the kept Tuesday's Push can still be skipped or moved.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'i@example.com');
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-0000000000a9', date_trunc('week', current_date)::date - 5);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value values
  (909, '00000000-0000-0000-0000-0000000000a9', 'Push', 'push', 45, '{4}'),
  (910, '00000000-0000-0000-0000-0000000000a9', 'Pull', 'pull', 45, '{2}');
insert into public.planned_days (user_id, day, workout_id, name, type)
values ('00000000-0000-0000-0000-0000000000a9', date_trunc('week', current_date)::date - 6, 909,
  'Push', 'push');
set local session_replication_role = origin;

create function pg_temp.fits(workout_id bigint, to_day integer) returns boolean language sql as $$
  select public.move_fits(w, monday + 1, case when to_day is null then null else monday + to_day end, monday + 2)
  from public.workouts w, (select date_trunc('week', current_date)::date - 7 as monday) m
  where w.id = fits.workout_id;
$$;

select ok(pg_temp.fits(909, null), 'A workout a kept day planned can be skipped there, though its weekdays changed');
select ok(pg_temp.fits(909, 4), 'and moved to a later free day');
select ok(not pg_temp.fits(910, null), 'while one the kept day did not plan cannot, though that is its weekday now');

-- J's device is a day ahead of the server: J kept through the server's today, whose Push J then
-- took off its weekday. Seen on the server's date, that kept day still plans Push.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'j@example.com');
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-0000000000aa', current_date);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, type, estimated_minutes, weekdays)
overriding system value
select 911, '00000000-0000-0000-0000-0000000000aa', 'Push', 'push', 45,
  array[(extract(isodow from current_date)::smallint % 7) + 1];
insert into public.planned_days (user_id, day, workout_id, name, type)
values ('00000000-0000-0000-0000-0000000000aa', current_date, 911, 'Push', 'push');
set local session_replication_role = origin;
select ok(
  (select public.move_fits(w, current_date, null, current_date) from public.workouts w where w.id = 911),
  'A kept day up to the server''s today plans what it kept, for a device a day ahead'
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
insert into public.planned_days_kept (user_id, through, started_on)
values ('00000000-0000-0000-0000-00000000000e', current_date - 4, current_date - 5);
insert into public.planned_days (user_id, day, workout_id, name, type)
select '00000000-0000-0000-0000-00000000000e', current_date - days, 900, 'Old', 'push'
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

select results_eq(
  $$ select count(distinct day)::integer from public.planned_workouts(current_date - 5, current_date + 1000, current_date) $$,
  $$ values (367) $$,
  'A range is read for a year at most'
);

-- ----------------------------------------------------------------------------------------------
-- The day the plan starts

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@example.com');

-- Six training days, at most as many as allowed: every day but the server's today, so that the
-- days around it are training days.
create function pg_temp.days() returns jsonb language sql as $$
  select jsonb_agg(d) from generate_series(1, 7) d where d <> extract(isodow from current_date);
$$;

create function pg_temp.onboard(today date) returns void language sql as $$
  select public.complete_onboarding(
    jsonb_build_object(
      'goal', 'stay_healthy', 'consentedPolicyVersion', '2026-10-21', 'sex', 'female',
      'birthYear', extract(year from current_date)::integer - 30, 'heightCm', 168, 'weightKg', 70,
      'activityLevel', 'light', 'experience', 'beginner',
      'trainingDays', pg_temp.days(), 'setup', 'gym',
      'sessionMinutes', 45, 'weightUnit', 'kg', 'heightUnit', 'cm', 'today', today
    ),
    jsonb_build_object('sessions', jsonb_build_array(jsonb_build_object(
      'weekdays', pg_temp.days(), 'type', 'full_body',
      'estimatedMinutes', 30, 'exercises', jsonb_build_array(jsonb_build_object(
        'exerciseId', 'Plank', 'slot', 'core', 'sets', 2,
        'target', jsonb_build_object('seconds', 30), 'restSeconds', 45)))))
  );
$$;

-- F1's device is a day behind the server, as in an evening west of UTC.
select pg_temp.sign_in('00000000-0000-0000-0000-0000000000f1');
select pg_temp.onboard(current_date - 1);
select results_eq(
  $$ select day - current_date from public.planned_workouts(current_date - 3, current_date - 1, current_date - 1) $$,
  $$ values (-1) $$,
  'The plan starts on the device''s day the onboarding is finished, so a device behind the server keeps its today'
);

-- F2's device is a day ahead, as in a morning east of UTC.
select pg_temp.sign_in('00000000-0000-0000-0000-0000000000f2');
select pg_temp.onboard(current_date + 1);
select results_eq(
  $$ select day - current_date from public.planned_workouts(current_date - 3, current_date + 1, current_date + 1) $$,
  $$ values (1) $$,
  'and a device ahead has no day before it planned'
);

reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f3', 'f3@example.com');
select pg_temp.sign_in('00000000-0000-0000-0000-0000000000f3');
select lives_ok(
  $$ select pg_temp.onboard(current_date + 3) $$,
  'A device clock more than a day off still finishes the onboarding'
);
select results_eq(
  $$ select started_on from public.planned_days_kept $$,
  $$ values (current_date) $$,
  'with the plan starting on the server''s day'
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
  $$ insert into public.planned_days (user_id, day, workout_id, name) values ('00000000-0000-0000-0000-00000000000d', current_date, 1, 'Fake') $$,
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
