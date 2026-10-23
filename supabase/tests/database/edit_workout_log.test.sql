-- edit_workout_log() replaces the sets of the caller's own log, checks them like log_workout(),
-- and leaves when the workout was done and its calories as they were.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

insert into public.weight_entries (user_id, weight_kg) values ('00000000-0000-0000-0000-00000000000a', 72);
insert into public.workouts (id, user_id, name, type, estimated_minutes)
  overriding system value values (900, '00000000-0000-0000-0000-00000000000a', null, 'push', 45);

create function pg_temp.sets(exercises jsonb) returns jsonb language sql as $$
  select jsonb_build_object('exercises', exercises);
$$;

-- User a's log: two sets of bench press and a plank.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select set_config('test.log', public.log_workout(jsonb_build_object(
  'workoutId', 900,
  'startedAt', now() - interval '1 hour',
  'finishedAt', now() - interval '10 minutes',
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Barbell_Bench_Press_-_Medium_Grip', 'sets', jsonb_build_array(
      jsonb_build_object('weightKg', 80, 'reps', 8),
      jsonb_build_object('weightKg', 80, 'reps', 7))),
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 50))))
))::text, true);
create temporary table before on commit drop as
  select started_at, finished_at, estimated_kcal from public.workout_logs;

-- Rejected edits change nothing.
select throws_ok(
  $$ select public.edit_workout_log(current_setting('test.log')::bigint, pg_temp.sets(
       jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets', '[]'::jsonb)))) $$,
  'BB010', 'A log needs at least one set',
  'An edit that removes every set is rejected'
);
select throws_ok(
  $$ select public.edit_workout_log(current_setting('test.log')::bigint, pg_temp.sets(
       jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets',
         jsonb_build_array(jsonb_build_object('reps', 10)))))) $$,
  'BB011', 'A set does not suit its exercise',
  'A set that does not suit its exercise is rejected'
);
select throws_ok(
  $$ select public.edit_workout_log(0, pg_temp.sets(jsonb_build_array(jsonb_build_object(
       'exerciseId', 'Plank', 'sets', jsonb_build_array(jsonb_build_object('seconds', 40)))))) $$,
  'BB013', 'Workout log not found',
  'An unknown log is rejected'
);
select is((select count(*)::integer from public.logged_sets), 3, 'Rejected edits keep the sets');

-- An edit replaces the sets: one bench press set changed, one removed, a plank set added. A
-- skipped exercise in between keeps the plank in its place.
select lives_ok(
  $$ select public.edit_workout_log(current_setting('test.log')::bigint, pg_temp.sets(
       jsonb_build_array(
         jsonb_build_object('exerciseId', 'Barbell_Bench_Press_-_Medium_Grip', 'sets',
           jsonb_build_array(jsonb_build_object('weightKg', 82.5, 'reps', 8))),
         jsonb_build_object('exerciseId', 'Pushups', 'sets', '[]'::jsonb),
         jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
           jsonb_build_object('seconds', 50), jsonb_build_object('seconds', 45)))))) $$,
  'Owners edit their log'
);
select results_eq(
  $$ select exercise_position, set_position, exercise_id, weight_kg, reps, seconds
     from public.logged_sets order by exercise_position, set_position $$,
  $$ values
     (0::smallint, 0::smallint, 'Barbell_Bench_Press_-_Medium_Grip', 82.5::numeric, 8::smallint, null::integer),
     (2::smallint, 0::smallint, 'Plank', null::numeric, null::smallint, 50),
     (2::smallint, 1::smallint, 'Plank', null::numeric, null::smallint, 45) $$,
  'The edit replaces the sets'
);
select results_eq(
  $$ select started_at, finished_at, estimated_kcal from public.workout_logs $$,
  $$ select * from before $$,
  'The time and the calories stay as they were'
);
select results_eq(
  $$ select sets, kilograms from public.workout_log_summaries $$,
  $$ values (3, 660::numeric) $$,
  'The summary follows the edit'
);

-- Other users cannot edit the log, and anon cannot call the function.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.edit_workout_log(current_setting('test.log')::bigint, pg_temp.sets(
       jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets',
         jsonb_build_array(jsonb_build_object('seconds', 1)))))) $$,
  'BB013', 'Workout log not found',
  'Users cannot edit other users'' logs'
);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.edit_workout_log(1, '{}') $$,
  '42501', null,
  'Anon cannot edit a log'
);

select * from finish();
rollback;
