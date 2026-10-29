-- day_training() gives how the caller trained on each day of a range, at most a year: the minutes
-- and the weight lifted, and the planned workouts done or missed from the day the streak starts
-- (ADR 0044, ADR 0047). Only the caller's own.
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

-- Written as the database, so that each log keeps exactly the day and times given.
set local session_replication_role = replica;

create function pg_temp.log(id bigint, owner uuid, workout_id bigint, on_day date, minutes integer)
returns void language sql as $$
  insert into public.workout_logs (id, user_id, workout_id, source_workout_id, name, started_at,
    finished_at, started_on)
  overriding system value
  values (id, owner, workout_id, workout_id, 'Push', on_day + time '18:00',
    on_day + time '18:00' + make_interval(mins => minutes), on_day);
$$;

-- User a's streak starts ten days ago. Push is planned on the weekday of today, and was planned
-- three and two days ago, and twelve days ago, before the streak started.
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes)
  overriding system value
  values (930, '00000000-0000-0000-0000-00000000000a', 'Push',
    array[extract(isodow from current_date)::smallint], true, 45);
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000a', current_date - 1, current_date - 10);
insert into public.planned_days (user_id, day, workout_id, name)
select '00000000-0000-0000-0000-00000000000a', current_date - d, 930, 'Push'
from unnest(array[12, 3, 2]) d;
-- Done three days ago for 90 minutes, lifting 80 kg 8 and 6 times and holding a plank; a workout
-- not planned five days ago for 30 minutes.
select pg_temp.log(800, '00000000-0000-0000-0000-00000000000a', 930, current_date - 3, 90);
select pg_temp.log(801, '00000000-0000-0000-0000-00000000000a', null, current_date - 5, 30);
-- A workout of 20 seconds six days ago.
insert into public.workout_logs (id, user_id, name, started_at, finished_at, started_on)
  overriding system value
  values (803, '00000000-0000-0000-0000-00000000000a', 'Push', current_date - 6 + time '18:00',
    current_date - 6 + time '18:00:20', current_date - 6);
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds)
values
  (800, '00000000-0000-0000-0000-00000000000a', 0, 0, 'Barbell_Bench_Press_-_Medium_Grip', 80, 8, null),
  (800, '00000000-0000-0000-0000-00000000000a', 0, 1, 'Barbell_Bench_Press_-_Medium_Grip', 80, 6, null),
  (800, '00000000-0000-0000-0000-00000000000a', 1, 0, 'Plank', null, null, 45);
-- User b trained on the same day.
select pg_temp.log(802, '00000000-0000-0000-0000-00000000000b', null, current_date - 3, 60);

set local session_replication_role = origin;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select minutes, lifted_kg, done, missed
     from public.day_training(current_date - 3, current_date - 2, current_date) $$,
  $$ values (90, 1120.00::numeric, 1, 0), (0, 0::numeric, 0, 1) $$,
  'A planned workout done gives its minutes and weight lifted, one not done is missed'
);
select results_eq(
  $$ select minutes, done, missed
     from public.day_training(current_date - 5, current_date - 5, current_date) $$,
  $$ values (30, 0, 0) $$,
  'A workout that was not planned gives its minutes'
);
select is(
  (select minutes from public.day_training(current_date - 6, current_date - 6, current_date)),
  1,
  'A workout shorter than a minute counts as one'
);
select results_eq(
  $$ select done, missed from public.day_training(current_date, current_date, current_date) $$,
  $$ values (0, 0) $$,
  'A workout planned today is not missed yet'
);
select results_eq(
  $$ select missed from public.day_training(current_date - 12, current_date - 12, current_date) $$,
  $$ values (0) $$,
  'Before the streak starts, nothing is missed'
);
select is(
  (select count(*)::integer from public.day_training(current_date - 400, current_date, current_date)),
  367,
  'A range gives at most a year of days, and one more for a 29 February'
);
select is(
  (select max(day) from public.day_training('2027-10-29', '2028-10-29', current_date)),
  '2028-10-29'::date,
  'A year over a 29 February reaches its last day'
);
select throws_ok(
  $$ select * from public.day_training(current_date - 3, current_date, current_date + 5) $$,
  '22023', null,
  'A today that is not the device''s today is refused'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select minutes from public.day_training(current_date - 3, current_date - 3, current_date)),
  60,
  'Another user gets only their own workouts'
);
select is(
  (select sum(done + missed)::integer
   from public.day_training(current_date - 12, current_date, current_date)),
  0,
  'Another user gets none of the plan'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.day_training(current_date - 3, current_date, current_date) $$,
  '42501', null,
  'Anon gets nothing'
);

select * from finish();
rollback;
