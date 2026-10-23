-- exercise_progress() sums up an exercise per finished workout, and exercise_records() finds the
-- caller's records of it, the kinds following what the exercise records.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

insert into public.workouts (id, user_id, name, type, estimated_minutes)
  overriding system value values (900, '00000000-0000-0000-0000-00000000000a', null, 'push', 45);

-- A workout days ago with one exercise and its sets.
create function pg_temp.log(days integer, exercise_id text, sets jsonb) returns bigint
language sql as $$
  select public.log_workout(jsonb_build_object(
    'workoutId', 900,
    'startedAt', now() - make_interval(days => days, mins => 60),
    'finishedAt', now() - make_interval(days => days),
    'exercises', jsonb_build_array(jsonb_build_object('exerciseId', exercise_id, 'sets', sets))
  ));
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select pg_temp.log(10, 'Barbell_Bench_Press_-_Medium_Grip', '[
  {"weightKg": 70, "reps": 10}, {"weightKg": 75, "reps": 7}]');
select pg_temp.log(5, 'Barbell_Bench_Press_-_Medium_Grip', '[
  {"weightKg": 80, "reps": 8}, {"weightKg": 80, "reps": 8}, {"weightKg": 85, "reps": 7}]');
-- Equalling a record later does not take it over.
select pg_temp.log(1, 'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 85, "reps": 1}]');
select pg_temp.log(4, 'Plank', '[{"seconds": 75}, {"seconds": 65}]');
select pg_temp.log(2, 'Plank', '[{"seconds": 50}, {"seconds": 45}]');
select pg_temp.log(3, 'Rowing_Stationary', '[{"meters": 2000, "seconds": 480}]');
select pg_temp.log(2, 'Rowing_Stationary', '[{"meters": 1000, "seconds": 220}]');
select pg_temp.log(1, 'Pushups', '[{"reps": 20}, {"weightKg": 10, "reps": 12}]');

select is(public.one_rep_max(85, 7), 104.8, 'The one-rep max is estimated with Epley''s formula');
select is(public.one_rep_max(100, 1), 100::numeric, 'A single rep is its own one-rep max');

select results_eq(
  $$ select heaviest_kg, one_rep_max_kg, volume_kg, most_reps, total_reps
     from public.exercise_progress('Barbell_Bench_Press_-_Medium_Grip') $$,
  $$ values (75.00, 93.3, 1225.00, 10, 17),
            (85.00, 104.8, 1875.00, 8, 23),
            (85.00, 85.00, 85.00, 1, 1) $$,
  'The progress of a weighted exercise, workout by workout, oldest first'
);
select results_eq(
  $$ select longest_seconds, total_seconds from public.exercise_progress('Plank') $$,
  $$ values (75, 140), (50, 95) $$,
  'The progress of a held exercise'
);

select results_eq(
  $$ select kind, value, weight_kg, reps, achieved_at::date
     from public.exercise_records('Barbell_Bench_Press_-_Medium_Grip') order by kind $$,
  $$ values ('best_set', 700.00, 70.00, 10, (now() - interval '10 days')::date),
            ('heaviest', 85.00, 85.00, 7, (now() - interval '5 days')::date),
            ('most_reps', 10.00, 70.00, 10, (now() - interval '10 days')::date),
            ('one_rep_max', 104.8, 85.00, 7, (now() - interval '5 days')::date) $$,
  'A weighted exercise has its heaviest set, one-rep max, best set and most reps, first reached'
);
select results_eq(
  $$ select kind, exercise_position, set_position
     from public.exercise_records('Barbell_Bench_Press_-_Medium_Grip') order by kind $$,
  $$ values ('best_set', 0::smallint, 0::smallint), ('heaviest', 0::smallint, 2::smallint),
            ('most_reps', 0::smallint, 0::smallint), ('one_rep_max', 0::smallint, 2::smallint) $$,
  'A record names the place of its set in the workout'
);
select results_eq(
  $$ select exercise_position, set_position from public.exercise_records('Plank')
     where kind = 'most_time' $$,
  $$ values (null::smallint, null::smallint) $$,
  'The most time in a workout is no single set'
);
select results_eq(
  $$ select kind, value from public.exercise_records('Plank') order by kind $$,
  $$ values ('longest_time', 75::numeric), ('most_time', 140::numeric) $$,
  'A held exercise has its longest set and most time in a workout'
);
select results_eq(
  $$ select kind, value from public.exercise_records('Rowing_Stationary') order by kind $$,
  $$ values ('best_pace', 220.0), ('longest_distance', 2000::numeric) $$,
  'A distance has its longest set and its fastest pace'
);
select results_eq(
  $$ select kind, value from public.exercise_records('Pushups') order by kind $$,
  $$ values ('heaviest', 10.00), ('most_reps', 20.00) $$,
  'A bodyweight exercise has its most reps and its heaviest added weight'
);

-- Other users have no records of the caller's sets, and anon cannot ask.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ select * from public.exercise_records('Barbell_Bench_Press_-_Medium_Grip') $$,
  'Records only come from the caller''s logs'
);
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.exercise_progress('Plank') $$,
  '42501', null,
  'Anon cannot read progress'
);

select * from finish();
rollback;
