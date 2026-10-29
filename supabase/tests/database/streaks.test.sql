-- A day counts for the streak when its planned workouts, after moves, were started on it, none
-- was skipped, and more than none but no more than its target's calories were eaten (ADR 0042,
-- ADR 0044). A missed day breaks the streak until the user freezes it or starts again; days are
-- kept once they are final. Users read only their own streak, and only the functions write it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The Monday two weeks ago: a week that is past whatever day the tests run on.
create function pg_temp.w(offset_days integer) returns date language sql as $$
  select date_trunc('week', current_date)::date - 14 + offset_days;
$$;

-- Written as the database, without the triggers that check and copy, so that each day eats
-- exactly the calories given: `kcal` grams of a food of 100 kcal per 100 g.
set local session_replication_role = replica;

-- Every user's target is 2,000 kcal a day.
insert into public.own_nutrition_targets (user_id, calories, protein_g, carbs_g, fat_g)
select id, 2000, 100, 250, 60 from auth.users where email like '_@example.com';

create function pg_temp.eat(owner uuid, on_day date, kcal integer) returns void language sql as $$
  insert into public.meal_entries (user_id, day, meal, food_id, grams, kcal_per_100g)
  values (owner, on_day, 'lunch', (select id from public.foods order by id limit 1), kcal, 100);
$$;

-- User a: a workout planned on Monday to Thursday of that week, kept as planned (ADR 0041).
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes)
  overriding system value
  values (920, '00000000-0000-0000-0000-00000000000a', 'Push', '{}', true, 45);
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 1, pg_temp.w(0));
insert into public.planned_days (user_id, day, workout_id, name)
select '00000000-0000-0000-0000-00000000000a', pg_temp.w(d), 920, 'Push'
from generate_series(0, 3) d;
-- Skipped on Wednesday, moved from Thursday to Friday.
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values
  ('00000000-0000-0000-0000-00000000000a', 920, pg_temp.w(2), null),
  ('00000000-0000-0000-0000-00000000000a', 920, pg_temp.w(3), pg_temp.w(4));
-- Done on Monday, on Friday, where it moved, and on Wednesday, though skipped.
create function pg_temp.done(workout_id bigint, on_day date) returns void language sql as $$
  insert into public.workout_logs (user_id, workout_id, source_workout_id, name, started_at,
    finished_at, started_on)
  values ('00000000-0000-0000-0000-00000000000a', workout_id, workout_id, 'Push',
    on_day + time '18:00', on_day + time '19:00', on_day);
$$;
select pg_temp.done(920, d) from unnest(array[pg_temp.w(0), pg_temp.w(4), pg_temp.w(2)]) d;
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.w(d), 1500)
from generate_series(0, 4) d;
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.w(5), 2100);

-- The next week: a workout done on Monday and deleted since, and one moved away from Tuesday that
-- settling turned into a skip when it was archived.
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes)
  overriding system value values
  (921, '00000000-0000-0000-0000-00000000000a', 'Legs', '{}', true, 45),
  (922, '00000000-0000-0000-0000-00000000000a', 'Pull', '{}', false, 45);
insert into public.planned_days (user_id, day, workout_id, name) values
  ('00000000-0000-0000-0000-00000000000a', pg_temp.w(7), 921, 'Legs'),
  ('00000000-0000-0000-0000-00000000000a', pg_temp.w(8), 922, 'Pull');
insert into public.workout_moves (user_id, workout_id, from_on, to_on, settled)
  values ('00000000-0000-0000-0000-00000000000a', 922, pg_temp.w(8), null, true);
select pg_temp.done(921, pg_temp.w(7));
select pg_temp.eat('00000000-0000-0000-0000-00000000000a', pg_temp.w(d), 1500)
from generate_series(7, 8) d;

-- User b, from six days ago: rest days, all eaten to the target but three days ago.
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000b', current_date - 1, current_date - 6);
select pg_temp.eat('00000000-0000-0000-0000-00000000000b', current_date - d, 1000)
from generate_series(4, 6) d;
select pg_temp.eat('00000000-0000-0000-0000-00000000000b', current_date - d, 2000)
from generate_series(1, 2) d;

-- Users c and d, from twelve days ago, have eaten nothing. User d is from before the streak, so
-- the days before today are answered.
insert into public.planned_days_kept (user_id, through, started_on) values
  ('00000000-0000-0000-0000-00000000000c', current_date - 1, current_date - 12),
  ('00000000-0000-0000-0000-00000000000d', current_date - 1, current_date - 12);
insert into public.user_streaks (user_id, answered_through)
  values ('00000000-0000-0000-0000-00000000000d', current_date - 1);

set local session_replication_role = origin;

-- ----------------------------------------------------------------------------------------------
-- How a day goes

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select day, state from public.streak_states(pg_temp.w(-3), pg_temp.w(6), current_date) $$,
  $$ values
       (pg_temp.w(0), 'counted'),
       (pg_temp.w(1), 'missed'),
       (pg_temp.w(2), 'missed'),
       (pg_temp.w(3), 'counted'),
       (pg_temp.w(4), 'counted'),
       (pg_temp.w(5), 'missed'),
       (pg_temp.w(6), 'missed') $$,
  'A day counts with its workouts done and its calories eaten, from the first day on'
);
select is(
  (select state from public.streak_states(pg_temp.w(0), pg_temp.w(0), current_date)),
  'counted',
  'A workout started on its day counts'
);
select is(
  (select state from public.streak_states(pg_temp.w(1), pg_temp.w(1), current_date)),
  'missed',
  'A workout not started on its day misses the day'
);
select is(
  (select state from public.streak_states(pg_temp.w(2), pg_temp.w(2), current_date)),
  'missed',
  'A skipped workout misses the day, though it was done anyway'
);
select is(
  (select state from public.streak_states(pg_temp.w(3), pg_temp.w(4), current_date) order by day limit 1),
  'counted',
  'A workout moved away leaves its day to the calories'
);
select is(
  (select state from public.streak_states(pg_temp.w(4), pg_temp.w(4), current_date)),
  'counted',
  'A workout counts on the day it moved to'
);
select is(
  (select state from public.streak_states(pg_temp.w(5), pg_temp.w(5), current_date)),
  'missed',
  'More calories than the target miss the day'
);
select is(
  (select state from public.streak_states(pg_temp.w(6), pg_temp.w(6), current_date)),
  'missed',
  'A day without any calories is missed'
);
select is(
  (select state from public.streak_states(pg_temp.w(8), pg_temp.w(8), current_date)),
  'counted',
  'A move that settling turned into a skip leaves its day to the calories'
);

reset role;
delete from public.workouts where id = 921;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select state from public.streak_states(pg_temp.w(7), pg_temp.w(7), current_date)),
  'counted',
  'A workout deleted since still counts on the day it was done'
);

-- ----------------------------------------------------------------------------------------------
-- The streak and its break

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is(
  (select state from public.streak_states(current_date, current_date, current_date)),
  'open',
  'Today is open until it counts'
);
select results_eq(
  $$ select count, counted_today, freezes, missed, saved_count from public.streak(current_date) $$,
  $$ values (2, false, 3, array[current_date - 3], 6) $$,
  'A missed day breaks the streak, and the break lists it with the streak it would save'
);
select is(
  (select count(*)::integer from public.user_streaks),
  1,
  'Every user starts with 3 freezes'
);

reset role;
set local session_replication_role = replica;
select pg_temp.eat('00000000-0000-0000-0000-00000000000b', current_date, 500);
set local session_replication_role = origin;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select count, counted_today from public.streak(current_date) $$,
  $$ values (3, true) $$,
  'Today adds to the streak once it counts'
);
select is(
  (select state from public.streak_states(current_date, current_date, current_date)),
  'counted',
  'Today counts once its calories are eaten'
);
select is(
  (select state from public.streak_states(current_date - 1, current_date - 1, current_date)),
  'counted',
  'Exactly the target counts'
);

select lives_ok(
  $$ select public.answer_streak_break(current_date, true) $$,
  'Missed days can be frozen with enough freezes'
);
select results_eq(
  $$ select count, freezes, missed from public.streak(current_date) $$,
  $$ values (7, 2, '{}'::date[]) $$,
  'Freezing a missed day saves the streak, one freeze a day'
);
select is(
  (select result::text from public.streak_days where day = current_date - 3),
  'frozen',
  'A frozen day is kept as frozen'
);

-- Answered days are final: a meal deleted from one of them later changes nothing.
reset role;
delete from public.meal_entries
where user_id = '00000000-0000-0000-0000-00000000000b' and day = current_date - 1;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select count from public.streak(current_date)),
  7,
  'An answered day keeps how it went'
);
select is(
  (select counted_today from public.streak(current_date - 1)),
  false,
  'Today is worked out, though the device''s day went back to a kept one'
);

-- ----------------------------------------------------------------------------------------------
-- Not enough freezes, and starting again

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');

select results_eq(
  $$ select count, cardinality(missed), saved_count from public.streak(current_date) $$,
  $$ values (0, 12, 12) $$,
  'Every missed day not answered is listed'
);
select is(
  (select count(*)::integer from public.streak_days),
  4,
  'Days that can no longer be logged are kept'
);
select throws_ok(
  $$ select public.answer_streak_break(current_date, true) $$,
  'BB032', 'Not enough freezes for the missed days',
  'Freezes are not spent when they cannot cover every missed day'
);
select lives_ok(
  $$ select public.answer_streak_break(current_date, false) $$,
  'A break can be answered by starting again'
);
select results_eq(
  $$ select count, freezes, missed from public.streak(current_date) $$,
  $$ values (0, 3, '{}'::date[]) $$,
  'Starting again keeps the freezes and does not ask again'
);
select is(
  (select count(*)::integer from public.streak_days),
  12,
  'Answering keeps every day through yesterday'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000d');
select results_eq(
  $$ select count, missed from public.streak(current_date) $$,
  $$ values (0, '{}'::date[]) $$,
  'Users from before the streak have no break to answer'
);

-- ----------------------------------------------------------------------------------------------
-- Access

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');

select is(
  (select count(*)::integer from public.streak_days where user_id <> '00000000-0000-0000-0000-00000000000c'),
  0,
  'Users read only their own streak days'
);
select is(
  (select count(*)::integer from public.user_streaks where user_id <> '00000000-0000-0000-0000-00000000000c'),
  0,
  'Users read only their own freezes'
);
select throws_ok(
  $$ update public.user_streaks set freezes = 100 $$,
  '42501', null,
  'Freezes are not written directly'
);
select throws_ok(
  $$ insert into public.streak_days (user_id, day, result)
     values ('00000000-0000-0000-0000-00000000000c', current_date - 1, 'counted') $$,
  '42501', null,
  'Streak days are not written directly'
);
select throws_ok(
  $$ select public.streak(current_date + 5) $$,
  '22023', 'Today is the device''s today',
  'The streak takes the device''s today, within a day of the server''s'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.streak(current_date) $$,
  '42501', null,
  'Anon has no streak'
);
select throws_ok(
  $$ select * from public.streak_states(current_date - 7, current_date, current_date) $$,
  '42501', null,
  'Anon has no streak days'
);
select throws_ok(
  $$ select public.answer_streak_break(current_date, false) $$,
  '42501', null,
  'Anon answers no break'
);

-- ----------------------------------------------------------------------------------------------
-- The device's day of a finished workout

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- Started ten minutes ago, ending now.
create function pg_temp.log(started_on date) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'workoutId', 920,
    'startedAt', now() - interval '10 minutes',
    'finishedAt', now(),
    'startedOn', started_on,
    'exercises', jsonb_build_array(jsonb_build_object(
      'exerciseId', 'Plank', 'sets', jsonb_build_array(jsonb_build_object('seconds', 60))))
  ));
$$;

create function pg_temp.last_started_on() returns date language sql as $$
  select started_on from public.workout_logs order by id desc limit 1;
$$;

select public.log_workout(pg_temp.log(((now() - interval '10 minutes') at time zone 'UTC')::date + 1));
select is(
  pg_temp.last_started_on(),
  ((now() - interval '10 minutes') at time zone 'UTC')::date + 1,
  'A log keeps the device''s day it started on'
);
select public.log_workout(pg_temp.log(null));
select is(
  pg_temp.last_started_on(),
  ((now() - interval '10 minutes') at time zone 'UTC')::date,
  'A log without the day keeps the start''s day in UTC'
);

select * from finish();
rollback;
