-- move_workout() moves a workout to another day of its week, or skips it, only as the plan
-- allows. log_workout() saves a move that comes with a log when it fits. Users read and undo only
-- their own moves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

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

-- A day next to three days ago in the same week, on which workout 912 is planned.
create function pg_temp.late_planned() returns date language sql as $$
  select case when extract(isodow from current_date - 3) = 1 then current_date - 2
    else current_date - 4 end;
$$;

-- A day next to today in the same week, on which workout 914 is planned, so that a log started
-- today can carry its move to today, whatever day the tests run on.
create function pg_temp.next_to_today() returns date language sql as $$
  select case when extract(isodow from current_date) = 7 then current_date - 1
    else current_date + 1 end;
$$;

-- User a's workouts: one on Mondays and Thursdays, one archived on Mondays, one on weekends, one
-- on the day next to three days ago, and one on the day next to today.
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes)
  overriding system value values
  (910, '00000000-0000-0000-0000-00000000000a', 'Push', '{1,4}', true, 45),
  (911, '00000000-0000-0000-0000-00000000000a', 'Old', '{1}', false, 30),
  (912, '00000000-0000-0000-0000-00000000000a', 'Late', '{}', true, 30),
  (913, '00000000-0000-0000-0000-00000000000a', 'Weekend', '{6,7}', true, 30),
  (914, '00000000-0000-0000-0000-00000000000a', 'Soon', '{}', true, 30);
update public.workouts set weekdays = array[extract(isodow from pg_temp.late_planned())::smallint]
where id = 912;
update public.workouts set weekdays = array[extract(isodow from pg_temp.next_to_today())::smallint]
where id = 914;

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

-- A weekday the workout moved away from is free for another of its days.
select throws_ok(
  $$ select public.move_workout(913, pg_temp.day(6), pg_temp.day(7)) $$,
  'BB019', 'The move does not fit the plan',
  'A workout cannot move to another of its days'
);
select public.move_workout(913, pg_temp.day(7), null);
select lives_ok(
  $$ select public.move_workout(913, pg_temp.day(6), pg_temp.day(7)) $$,
  'A workout can move to one of its days once that day is skipped'
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

-- A move that comes with a log is saved with it when it fits, and left out when it does not. Its
-- target is the day the workout started, today.
create function pg_temp.log(workout_id integer, move jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'workoutId', workout_id,
    'startedAt', now() - interval '1 hour',
    'finishedAt', now() - interval '10 minutes',
    'exercises', jsonb_build_array(jsonb_build_object(
      'exerciseId', 'Plank', 'sets', jsonb_build_array(jsonb_build_object('seconds', 60)))),
    'move', move
  );
$$;

select public.log_workout(pg_temp.log(914,
  jsonb_build_object('from', pg_temp.next_to_today(), 'to', current_date)));
select results_eq(
  $$ select from_on, to_on from public.workout_moves where workout_id = 914 $$,
  $$ values (pg_temp.next_to_today(), current_date) $$,
  'A log saves the move it comes with'
);

select isnt(
  public.log_workout(pg_temp.log(910, jsonb_build_object('from', pg_temp.day(2), 'to', current_date))),
  null,
  'A log whose move does not fit is still saved'
);
select is(
  (select count(*)::integer from public.workout_moves
   where workout_id = 910 and from_on = pg_temp.day(2)),
  0,
  'A move that does not fit is left out of the log'
);

-- A log saved days later, as after being left open, keeps the move of the day it started.
select public.log_workout(jsonb_build_object(
  'workoutId', 912,
  'startedAt', now() - interval '3 days',
  'finishedAt', now() - interval '3 days' + interval '50 minutes',
  'exercises', jsonb_build_array(jsonb_build_object(
    'exerciseId', 'Plank', 'sets', jsonb_build_array(jsonb_build_object('seconds', 60)))),
  'move', jsonb_build_object('from', pg_temp.late_planned(), 'to', (now() - interval '3 days')::date)
));
select results_eq(
  $$ select from_on, to_on from public.workout_moves where workout_id = 912 $$,
  $$ values (pg_temp.late_planned(), (now() - interval '3 days')::date) $$,
  'A log saved days later keeps its move'
);
select public.log_workout(jsonb_build_object(
  'workoutId', 912,
  'startedAt', pg_temp.late_planned() + time '12:00',
  'finishedAt', pg_temp.late_planned() + time '12:40',
  'exercises', jsonb_build_array(jsonb_build_object(
    'exerciseId', 'Plank', 'sets', jsonb_build_array(jsonb_build_object('seconds', 60)))),
  'move', jsonb_build_object('from', pg_temp.late_planned(), 'to', pg_temp.late_planned())
));
select is_empty(
  $$ select 1 from public.workout_moves where workout_id = 912 $$,
  'A log on the day a workout moved away from undoes the move'
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
  (select count(*)::integer from public.workout_moves where workout_id = 910),
  2,
  'Another user cannot undo the moves'
);
delete from public.workout_moves where workout_id = 910 and from_on = pg_temp.day(1);
select results_eq(
  $$ select from_on from public.workout_moves where workout_id = 910 $$,
  $$ values (pg_temp.day(4)) $$,
  'A user undoes their own move'
);

-- Changing a workout's days or archiving it deletes this week's moves that no longer fit.
reset role;
delete from public.workout_moves where workout_id = 913;
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values
  ('00000000-0000-0000-0000-00000000000a', 913, pg_temp.day(6), pg_temp.day(5)),
  ('00000000-0000-0000-0000-00000000000a', 913, pg_temp.day(7), pg_temp.day(3)),
  ('00000000-0000-0000-0000-00000000000a', 913, pg_temp.day(7) - 14, pg_temp.day(6) - 14);
update public.workouts set weekdays = '{5,6}' where id = 913;
select results_eq(
  $$ select from_on from public.workout_moves where workout_id = 913 $$,
  $$ values (pg_temp.day(7) - 14) $$,
  'Moves from a day the workout left, or to a day it is now on, are deleted, earlier weeks stay'
);
update public.workouts set active = false where id = 910;
select is_empty(
  $$ select 1 from public.workout_moves where workout_id = 910 $$,
  'Archiving a workout deletes its moves of this week'
);

select * from finish();
rollback;
