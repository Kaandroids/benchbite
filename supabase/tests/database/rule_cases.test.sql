-- Generated from supabase/tests/rules/cases.json by `pnpm rules:sql`: edit the cases, not this file.
-- The database's side of the rules the app keeps a copy of (#546); Jest checks the app's.
begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

select is(public.one_rep_max(100, 1), 100::numeric, 'one_rep_max(100, 1)');
select is(public.one_rep_max(100, 10), 133.3::numeric, 'one_rep_max(100, 10)');
select is(public.one_rep_max(77.5, 8), 98.2::numeric, 'one_rep_max(77.5, 8)');
select is(public.one_rep_max(82.5, 5), 96.3::numeric, 'one_rep_max(82.5, 5)');
select is(public.one_rep_max(60, 15), 90::numeric, 'one_rep_max(60, 15)');
select is(public.one_rep_max(37.5, 7), 46.3::numeric, 'one_rep_max(37.5, 7)');
select is(public.one_rep_max(93.75, 4), 106.3::numeric, 'one_rep_max(93.75, 4)');
select is(public.one_rep_max(82.1, 15), 123.2::numeric, 'one_rep_max(82.1, 15)');
select is(public.one_rep_max(20.9, 15), 31.4::numeric, 'one_rep_max(20.9, 15)');

select is(public.weight_step('barbell'), 2.5::numeric, 'weight_step(barbell)');
select is(public.weight_step('dumbbell'), 2::numeric, 'weight_step(dumbbell)');
select is(public.weight_step('kettlebells'), 4::numeric, 'weight_step(kettlebells)');
select is(public.weight_step('machine'), 2.5::numeric, 'weight_step(machine)');
select is(public.weight_step(null), 2.5::numeric, 'weight_step(null)');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000005e1', 'rules@example.com');
create temporary table cases (n integer, log_id bigint, exercise_id text) on commit drop;
grant select on cases to public;

with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{weight,reps}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 0, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, 80, 8,
  null, null
from cases where n = 0;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{weight,reps}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 1, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, null, 10,
  null, null
from cases where n = 1;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{reps}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 2, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, 10, 12,
  null, null
from cases where n = 2;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{reps}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 3, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, null, 15,
  null, null
from cases where n = 3;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{duration}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 4, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, null, null,
  50, null
from cases where n = 4;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{weight,duration}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 5, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, 20, null,
  45, null
from cases where n = 5;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{distance,duration}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 6, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, null, null,
  492, 2000
from cases where n = 6;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{distance,duration}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 7, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, null, null,
  null, 5000
from cases where n = 7;
with exercise as (
  select id from public.exercises
  where owner_id is null and metrics = '{weight,distance}' order by id limit 1
), log as (
  insert into public.workout_logs (user_id, name, started_at, finished_at, started_on)
  values ('00000000-0000-0000-0000-0000000005e1', 'Rules', now() - interval '1 hour', now(), current_date) returning id
)
insert into cases select 8, log.id, exercise.id from log, exercise;
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id,
  weight_kg, reps, seconds, meters)
select log_id, '00000000-0000-0000-0000-0000000005e1', 0, 0, exercise_id, 40, null,
  30, 50
from cases where n = 8;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000006168576', 'week0@example.com');
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (101, '00000000-0000-0000-0000-000006168576', 'Workout 1', '{1,4}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (102, '00000000-0000-0000-0000-000006168576', 'Workout 2', '{2}', true, 45);
insert into public.workout_logs (user_id, name, started_at, finished_at, started_on, source_workout_id) values ('00000000-0000-0000-0000-000006168576', 'Workout 1', '2027-01-04 10:00', '2027-01-04 11:00', '2027-01-04', 101);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000006168577', 'week1@example.com');
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (201, '00000000-0000-0000-0000-000006168577', 'Workout 1', '{1,4}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (202, '00000000-0000-0000-0000-000006168577', 'Workout 2', '{2}', true, 45);
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values ('00000000-0000-0000-0000-000006168577', 201, '2027-01-04', '2027-01-06');
insert into public.workout_logs (user_id, name, started_at, finished_at, started_on, source_workout_id) values ('00000000-0000-0000-0000-000006168577', 'Workout 1', '2027-01-06 10:00', '2027-01-06 11:00', '2027-01-06', 201);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000006168578', 'week2@example.com');
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (301, '00000000-0000-0000-0000-000006168578', 'Workout 1', '{1,4}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (302, '00000000-0000-0000-0000-000006168578', 'Workout 2', '{2}', true, 45);
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values ('00000000-0000-0000-0000-000006168578', 302, '2027-01-05', null);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000006168579', 'week3@example.com');
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (401, '00000000-0000-0000-0000-000006168579', 'Workout 1', '{1,4}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (402, '00000000-0000-0000-0000-000006168579', 'Workout 2', '{2}', true, 45);
insert into public.workout_moves (user_id, workout_id, from_on, to_on) values ('00000000-0000-0000-0000-000006168579', 402, '2027-01-05', null);
insert into public.workout_logs (user_id, name, started_at, finished_at, started_on, source_workout_id) values ('00000000-0000-0000-0000-000006168579', 'Workout 2', '2027-01-05 10:00', '2027-01-05 11:00', '2027-01-05', 402);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000006168580', 'week4@example.com');
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (501, '00000000-0000-0000-0000-000006168580', 'Workout 1', '{1,4}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (502, '00000000-0000-0000-0000-000006168580', 'Workout 2', '{2}', true, 45);
insert into public.workout_logs (user_id, name, started_at, finished_at, started_on, source_workout_id) values ('00000000-0000-0000-0000-000006168580', 'Workout 1', '2027-01-05 10:00', '2027-01-05 11:00', '2027-01-05', 501);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000006168581', 'week5@example.com');
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (601, '00000000-0000-0000-0000-000006168581', 'Workout 1', '{1,4}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (602, '00000000-0000-0000-0000-000006168581', 'Workout 2', '{2}', true, 45);
insert into public.workouts (id, user_id, name, weekdays, active, estimated_minutes) overriding system value values (603, '00000000-0000-0000-0000-000006168581', 'Workout 3', '{5}', false, 45);

-- As the user, whose logs alone row level security shows.
select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005e1", "role": "authenticated"}', true);

select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 0 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"heaviest":80,"one_rep_max":101.3,"best_set":640,"most_reps":8}'::jsonb,
  'record_candidates(): a lifted set counts for each record of weight and reps'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 1 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"most_reps":10}'::jsonb,
  'record_candidates(): a lifted set without its weight counts only for the reps'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 2 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"heaviest":10,"most_reps":12}'::jsonb,
  'record_candidates(): weight added to the body counts as the heaviest, not for a one-rep max'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 3 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"most_reps":15}'::jsonb,
  'record_candidates(): a set with the body''s weight alone counts for the reps'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 4 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"longest_time":50}'::jsonb,
  'record_candidates(): a held set counts for the longest time'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 5 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"longest_time":45}'::jsonb,
  'record_candidates(): a weighted hold counts for the longest time, its weight for no record'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 6 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"longest_distance":2000,"best_pace":246}'::jsonb,
  'record_candidates(): a distance in a time counts for the distance and the pace'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 7 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"longest_distance":5000}'::jsonb,
  'record_candidates(): a distance without a time counts for the distance'
);
select is(
  (select coalesce(jsonb_object_agg(r.kind, r.value), '{}') from cases c
   cross join lateral public.record_candidates(c.exercise_id) r
   where c.n = 8 and r.log_id = c.log_id and r.kind <> 'most_time'),
  '{"longest_distance":50}'::jsonb,
  'record_candidates(): a carry counts for the distance, its weight and a time from before for no record'
);

-- day_workouts() is closed to clients, so it runs without their role, as each case's user.
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000006168576", "role": "authenticated"}', true);
select is(
  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - 100,
     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')
   from public.day_workouts(date_trunc('week', '2027-01-06'::date)::date,
     date_trunc('week', '2027-01-06'::date)::date + 6, '2027-01-06') w),
  '[{"day":"2027-01-04","workoutId":1,"done":true,"skipped":false},{"day":"2027-01-05","workoutId":2,"done":false,"skipped":false},{"day":"2027-01-07","workoutId":1,"done":false,"skipped":false}]'::jsonb,
  'day_workouts(): a workout logged on its day is done there'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000006168577", "role": "authenticated"}', true);
select is(
  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - 200,
     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')
   from public.day_workouts(date_trunc('week', '2027-01-06'::date)::date,
     date_trunc('week', '2027-01-06'::date)::date + 6, '2027-01-06') w),
  '[{"day":"2027-01-05","workoutId":2,"done":false,"skipped":false},{"day":"2027-01-06","workoutId":1,"done":true,"skipped":false},{"day":"2027-01-07","workoutId":1,"done":false,"skipped":false}]'::jsonb,
  'day_workouts(): a moved workout is planned, and done, on the day it moved to'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000006168578", "role": "authenticated"}', true);
select is(
  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - 300,
     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')
   from public.day_workouts(date_trunc('week', '2027-01-06'::date)::date,
     date_trunc('week', '2027-01-06'::date)::date + 6, '2027-01-06') w),
  '[{"day":"2027-01-04","workoutId":1,"done":false,"skipped":false},{"day":"2027-01-05","workoutId":2,"done":false,"skipped":true},{"day":"2027-01-07","workoutId":1,"done":false,"skipped":false}]'::jsonb,
  'day_workouts(): a skipped workout stays on its day, skipped'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000006168579", "role": "authenticated"}', true);
select is(
  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - 400,
     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')
   from public.day_workouts(date_trunc('week', '2027-01-06'::date)::date,
     date_trunc('week', '2027-01-06'::date)::date + 6, '2027-01-06') w),
  '[{"day":"2027-01-04","workoutId":1,"done":false,"skipped":false},{"day":"2027-01-05","workoutId":2,"done":true,"skipped":false},{"day":"2027-01-07","workoutId":1,"done":false,"skipped":false}]'::jsonb,
  'day_workouts(): a skipped workout done anyway is done'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000006168580", "role": "authenticated"}', true);
select is(
  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - 500,
     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')
   from public.day_workouts(date_trunc('week', '2027-01-06'::date)::date,
     date_trunc('week', '2027-01-06'::date)::date + 6, '2027-01-06') w),
  '[{"day":"2027-01-04","workoutId":1,"done":false,"skipped":false},{"day":"2027-01-05","workoutId":2,"done":false,"skipped":false},{"day":"2027-01-07","workoutId":1,"done":false,"skipped":false}]'::jsonb,
  'day_workouts(): a workout logged on another day than its own is not done'
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000006168581", "role": "authenticated"}', true);
select is(
  (select coalesce(jsonb_agg(jsonb_build_object('day', w.day, 'workoutId', w.workout_id - 600,
     'done', w.done, 'skipped', w.skipped and not w.done) order by w.day, w.workout_id), '[]')
   from public.day_workouts(date_trunc('week', '2027-01-06'::date)::date,
     date_trunc('week', '2027-01-06'::date)::date + 6, '2027-01-06') w),
  '[{"day":"2027-01-04","workoutId":1,"done":false,"skipped":false},{"day":"2027-01-05","workoutId":2,"done":false,"skipped":false},{"day":"2027-01-07","workoutId":1,"done":false,"skipped":false}]'::jsonb,
  'day_workouts(): a workout put away has no days'
);

select * from finish();
rollback;
