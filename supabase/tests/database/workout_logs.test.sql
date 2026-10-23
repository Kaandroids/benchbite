-- log_workout() saves a finished workout with its sets, checks each set against what its exercise
-- records, and copies the workout's name. Users read and delete only their own logs, and
-- last_sets() returns the sets of each exercise's latest log.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- User a weighs 72 kg, so 50 minutes burn about 300 kcal at 5 METs.
insert into public.weight_entries (user_id, weight_kg) values ('00000000-0000-0000-0000-00000000000a', 72);
insert into public.workouts (id, user_id, name, type, estimated_minutes)
  overriding system value values
  (900, '00000000-0000-0000-0000-00000000000a', null, 'push', 45),
  (901, '00000000-0000-0000-0000-00000000000b', 'Arms', null, 30);

-- A log of an hour ago: bench press with weight and reps, a skipped plank, and stationary rowing
-- with a distance and a time.
create function pg_temp.log(more jsonb default '{}', exercises jsonb default null) returns jsonb
language sql as $$
  select jsonb_build_object(
    'workoutId', 900,
    'startedAt', now() - interval '1 hour',
    'finishedAt', now() - interval '10 minutes',
    'plannedExercises', 3,
    'plannedSets', 5,
    'exercises', coalesce(exercises, jsonb_build_array(
      jsonb_build_object('exerciseId', 'Barbell_Bench_Press_-_Medium_Grip', 'sets', jsonb_build_array(
        jsonb_build_object('weightKg', 80, 'reps', 8),
        jsonb_build_object('weightKg', 80, 'reps', 7))),
      jsonb_build_object('exerciseId', 'Plank', 'sets', '[]'::jsonb),
      jsonb_build_object('exerciseId', 'Rowing_Stationary', 'sets', jsonb_build_array(
        jsonb_build_object('meters', 2000, 'seconds', 490)))
    ))
  ) || more;
$$;

create function pg_temp.one_set(exercise_id text, set_values jsonb) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('exerciseId', exercise_id, 'sets', jsonb_build_array(set_values)));
$$;

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.log_workout(pg_temp.log()) $$,
  '42501', null,
  'Anon cannot log a workout'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- Rejected logs save nothing.
select throws_ok(
  $$ select public.log_workout(pg_temp.log('{}', jsonb_build_array(
       jsonb_build_object('exerciseId', 'Plank', 'sets', '[]'::jsonb)))) $$,
  'BB010', 'A log needs at least one set',
  'A log without sets is rejected'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log('{}', pg_temp.one_set('Plank', '{"reps": 10}'))) $$,
  'BB011', 'A set does not suit its exercise',
  'Reps for an exercise that records a time are rejected'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log('{}', pg_temp.one_set(
       'Barbell_Bench_Press_-_Medium_Grip', '{"weightKg": 80}'))) $$,
  'BB011', 'A set does not suit its exercise',
  'A weight without reps is rejected'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log('{}', pg_temp.one_set(
       'Barbell_Bench_Press_-_Medium_Grip', '{"reps": 8, "meters": 100}'))) $$,
  'BB011', 'A set does not suit its exercise',
  'A distance for an exercise that records none is rejected'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log(jsonb_build_object(
       'startedAt', now(), 'finishedAt', now() - interval '1 hour'))) $$,
  'BB012', 'The workout''s start and end do not make sense',
  'A workout that ends before it starts is rejected'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log(jsonb_build_object(
       'startedAt', now() - interval '13 hours', 'finishedAt', now()))) $$,
  'BB012', 'The workout''s start and end do not make sense',
  'A workout longer than 12 hours is rejected'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log('{"workoutId": 901}')) $$,
  'BB006', 'Workout not found',
  'Another user''s workout cannot be logged'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log('{"workoutId": null}')) $$,
  'BB006', 'Workout not found',
  'A log needs a workout'
);
select is_empty($$ select 1 from public.workout_logs $$, 'Rejected logs are not saved');

-- A valid log is saved with the workout's type and its sets in order.
select set_config('test.first', public.log_workout(pg_temp.log())::text, true);
select results_eq(
  $$ select workout_id, name, type::text, planned_exercises::integer, planned_sets::integer,
       estimated_kcal
     from public.workout_logs where id = current_setting('test.first')::bigint $$,
  $$ values (900::bigint, null::text, 'push', 3, 5, 300) $$,
  'The log keeps the workout, its type, what was planned and the calories from the weight then'
);
select results_eq(
  $$ select exercise_position::integer, set_position::integer, exercise_id, weight_kg, reps::integer,
       seconds, meters
     from public.logged_sets where log_id = current_setting('test.first')::bigint
     order by exercise_position, set_position $$,
  $$ values (0, 0, 'Barbell_Bench_Press_-_Medium_Grip', 80.00, 8, null::integer, null::integer),
            (0, 1, 'Barbell_Bench_Press_-_Medium_Grip', 80.00, 7, null, null),
            (2, 0, 'Rowing_Stationary', null, null, 490, 2000) $$,
  'The sets are saved in order, the skipped exercise left out'
);
select lives_ok(
  $$ select public.log_workout(pg_temp.log('{}', pg_temp.one_set(
       'Pushups', '{"weightKg": 10, "reps": 12}'))) $$,
  'A bodyweight exercise takes added weight'
);

-- last_sets() returns each exercise's latest log only.
select lives_ok(
  $$ select public.log_workout(pg_temp.log(jsonb_build_object(
       'startedAt', now() - interval '30 minutes', 'finishedAt', now() - interval '5 minutes'),
       pg_temp.one_set('Barbell_Bench_Press_-_Medium_Grip', '{"weightKg": 82.5, "reps": 6}'))) $$,
  'A later log is saved'
);
select results_eq(
  $$ select exercise_id, weight_kg, reps::integer
     from public.last_sets(array['Barbell_Bench_Press_-_Medium_Grip', 'Rowing_Stationary']) $$,
  $$ values ('Barbell_Bench_Press_-_Medium_Grip', 82.50, 6), ('Rowing_Stationary', null, null) $$,
  'last_sets() returns the sets of each exercise''s latest log'
);

-- Deleting the workout keeps its logs.
reset role;
delete from public.workouts where id = 900;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select workout_id, type::text from public.workout_logs
     where id = current_setting('test.first')::bigint $$,
  $$ values (null::bigint, 'push') $$,
  'A log outlives its workout, with the type it had'
);

-- Logs are written only by log_workout().
select throws_ok(
  $$ insert into public.workout_logs (user_id, type, started_at, finished_at)
     values ('00000000-0000-0000-0000-00000000000a', 'push', now() - interval '1 hour', now()) $$,
  '42501', null,
  'Users cannot write logs directly'
);
select throws_ok(
  $$ update public.logged_sets set reps = 20 $$,
  '42501', null,
  'Users cannot change logged sets'
);

-- Other users see nothing, and cannot delete the logs.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.workout_logs $$, 'Users cannot read other users'' logs');
select is_empty($$ select 1 from public.logged_sets $$, 'Users cannot read other users'' sets');
select is_empty(
  $$ select * from public.last_sets(array['Barbell_Bench_Press_-_Medium_Grip']) $$,
  'last_sets() only looks at the caller''s logs'
);
delete from public.workout_logs;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::integer from public.workout_logs), 3, 'Users cannot delete other users'' logs');

-- Owners delete a log with its sets.
delete from public.workout_logs where id = current_setting('test.first')::bigint;
select is_empty(
  $$ select 1 from public.logged_sets where log_id = current_setting('test.first')::bigint $$,
  'A deleted log takes its sets with it'
);

select * from finish();
rollback;
