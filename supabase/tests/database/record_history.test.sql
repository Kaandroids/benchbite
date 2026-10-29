-- record_history() lists each time a workout beat the best before it of a kind of record of an
-- exercise, the latest first (ADR 0024, ADR 0047). Only the caller's own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

insert into public.workouts (id, user_id, name, type, estimated_minutes)
  overriding system value values
  (900, '00000000-0000-0000-0000-00000000000a', null, 'push', 45),
  (901, '00000000-0000-0000-0000-00000000000b', null, 'push', 45);

-- A workout days ago with one exercise and its sets.
create function pg_temp.log(workout_id bigint, days integer, exercise_id text, sets jsonb)
returns bigint language sql as $$
  select public.log_workout(jsonb_build_object(
    'workoutId', workout_id,
    'startedAt', now() - make_interval(days => days, mins => 60),
    'finishedAt', now() - make_interval(days => days),
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', exercise_id, 'sets', sets))
  ));
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
-- Bench press: the first workout beats nothing; the second is heavier, with a better one-rep max
-- too; the third only equals the heaviest; the fourth has the most reps.
select pg_temp.log(900, 10, 'Barbell_Bench_Press_-_Medium_Grip', '[
  {"weightKg": 70, "reps": 10}, {"weightKg": 75, "reps": 7}]');
select pg_temp.log(900, 5, 'Barbell_Bench_Press_-_Medium_Grip', '[
  {"weightKg": 80, "reps": 8}, {"weightKg": 85, "reps": 7}]');
select pg_temp.log(900, 3, 'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 85, "reps": 1}]');
-- Rowing: a faster pace over a shorter distance.
select pg_temp.log(900, 2, 'Rowing_Stationary', '[{"meters": 2000, "seconds": 480}]');
select pg_temp.log(900, 1, 'Rowing_Stationary', '[{"meters": 1000, "seconds": 220}]');
select pg_temp.log(900, 1, 'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 50, "reps": 12}]');
-- Plank: a worse workout, then a longer set but less time in all.
select pg_temp.log(900, 4, 'Plank', '[{"seconds": 75}, {"seconds": 65}]');
select pg_temp.log(900, 3, 'Plank', '[{"seconds": 50}]');
select pg_temp.log(900, 0, 'Plank', '[{"seconds": 90}]');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select pg_temp.log(901, 9, 'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 100, "reps": 5}]');
select pg_temp.log(901, 8, 'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 120, "reps": 5}]');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select exercise_id, kind, value, previous from public.record_history() $$,
  $$ values
       ('Plank', 'longest_time', 90::numeric, 75::numeric),
       ('Barbell_Bench_Press_-_Medium_Grip', 'most_reps', 12::numeric, 10::numeric),
       ('Rowing_Stationary', 'best_pace', 220.0::numeric, 240.0::numeric),
       ('Barbell_Bench_Press_-_Medium_Grip', 'heaviest', 85.00::numeric, 75.00::numeric) $$,
  'Each workout that beat a best gives its first kind, the latest first; equalling it gives none'
);
select results_eq(
  $$ select weight_kg, reps, achieved_on from public.record_history()
     where kind = 'heaviest' $$,
  $$ values (85.00::numeric, 7, (now() - interval '5 days 1 hour')::date) $$,
  'A record gives the set that beat the best, and its day'
);
select is(
  (select count(*)::integer from public.record_history() where exercise_id = 'Rowing_Stationary'
    and kind = 'longest_distance'),
  0,
  'A first value beats nothing'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select kind, value, previous from public.record_history() $$,
  $$ values ('heaviest', 120.00::numeric, 100.00::numeric) $$,
  'Another user gets only their own records'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.record_history() $$,
  '42501', null,
  'Anon gets nothing'
);

select * from finish();
rollback;
