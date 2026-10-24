-- move_workout() moves a workout to another day of its week, or skips it, only as the plan
-- allows. log_workout() saves a move that comes with a log when it fits. Users read and undo only
-- their own moves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A day of this week, 1 for Monday to 7 for Sunday. Sunday is never before today, so a move to it
-- always fits, whatever day the tests run on.
create function pg_temp.day(weekday integer) returns date language sql as $$
  select date_trunc('week', current_date)::date + weekday - 1;
$$;

-- User a's workouts: one on Mondays and Thursdays, one archived on Mondays.
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes)
  overriding system value values
  (910, '00000000-0000-0000-0000-00000000000a', 'Push', '{1,4}', true, 45),
  (911, '00000000-0000-0000-0000-00000000000a', 'Old', '{1}', false, 30);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(1), pg_temp.day(7)) $$,
  '42501', null,
  'Anon cannot move a workout'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ select public.move_workout(910, pg_temp.day(1), pg_temp.day(7)) $$,
  'A workout moves from one of its days to a free day of the same week'
);
select lives_ok(
  $$ select public.move_workout(910, pg_temp.day(1), pg_temp.day(6)) $$,
  'A moved day can move again'
);
select results_eq(
  $$ select from_on, to_on from public.workout_moves where workout_id = 910 $$,
  $$ values (pg_temp.day(1), pg_temp.day(6)) $$,
  'Moving a day again changes its target'
);

select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(4), pg_temp.day(6)) $$,
  'BB019', 'The move does not fit the plan',
  'A workout cannot move to a day another move already put it on'
);
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(1), pg_temp.day(4)) $$,
  'BB019', 'The move does not fit the plan',
  'A workout cannot move to one of its own days'
);
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(1), pg_temp.day(1)) $$,
  'BB019', 'The move does not fit the plan',
  'A workout cannot move to the day it is on'
);
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(4), pg_temp.day(4) + 7) $$,
  'BB019', 'The move does not fit the plan',
  'A workout cannot move to another week'
);
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(2), pg_temp.day(7)) $$,
  'BB019', 'The move does not fit the plan',
  'A workout moves only from one of its days'
);
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(1) - 14, pg_temp.day(1) - 8) $$,
  'BB019', 'The move does not fit the plan',
  'A workout moves only in this week'
);
select throws_ok(
  $$ select public.move_workout(911, pg_temp.day(1), pg_temp.day(7)) $$,
  'BB019', 'The move does not fit the plan',
  'An archived workout does not move'
);

select lives_ok(
  $$ select public.move_workout(910, pg_temp.day(4), null) $$,
  'A workout can be skipped on one of its days'
);
select results_eq(
  $$ select to_on from public.workout_moves where workout_id = 910 and from_on = pg_temp.day(4) $$,
  $$ values (null::date) $$,
  'A skip is a move without a target'
);

select throws_ok(
  $$ insert into public.workout_moves (user_id, workout_id, from_on, to_on)
     values ('00000000-0000-0000-0000-00000000000a', 910, pg_temp.day(4), pg_temp.day(5)) $$,
  '42501', null,
  'Moves are not written directly'
);

-- A move that comes with a log is saved with it when it fits, and left out when it does not.
create function pg_temp.log(move jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'workoutId', 910,
    'startedAt', now() - interval '1 hour',
    'finishedAt', now() - interval '10 minutes',
    'exercises', jsonb_build_array(jsonb_build_object(
      'exerciseId', 'Plank', 'sets', jsonb_build_array(jsonb_build_object('seconds', 60)))),
    'move', move
  );
$$;

select public.log_workout(pg_temp.log(jsonb_build_object('from', pg_temp.day(4), 'to', pg_temp.day(7))));
select results_eq(
  $$ select to_on from public.workout_moves where workout_id = 910 and from_on = pg_temp.day(4) $$,
  $$ values (pg_temp.day(7)) $$,
  'A log saves the move it comes with'
);

select isnt(
  public.log_workout(pg_temp.log(jsonb_build_object('from', pg_temp.day(2), 'to', pg_temp.day(3)))),
  null,
  'A log whose move does not fit is still saved'
);
select is(
  (select count(*)::integer from public.workout_moves where from_on = pg_temp.day(2)),
  0,
  'A move that does not fit is left out of the log'
);

-- Other users neither move nor see another user's workouts and moves.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.move_workout(910, pg_temp.day(1), pg_temp.day(5)) $$,
  'BB006', 'Workout not found',
  'Another user cannot move the workout'
);
select is_empty(
  $$ select 1 from public.workout_moves $$,
  'Another user sees none of the moves'
);
delete from public.workout_moves;

-- Undoing a move deletes it.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::integer from public.workout_moves),
  2,
  'Another user cannot undo the moves'
);
delete from public.workout_moves where from_on = pg_temp.day(1);
select results_eq(
  $$ select from_on from public.workout_moves $$,
  $$ values (pg_temp.day(4)) $$,
  'A user undoes their own move'
);

select * from finish();
rollback;
