-- A workout's heart rate over its time and its sets' times (#480, ADR 0104): set_workout_health()
-- keeps the samples with a whole read, cleaned and within the workout, and estimates the calories
-- from the heart rate; log_workout() and edit_workout_log() keep when each set was done.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.profiles (user_id, sex, birth_year, height_cm, activity_level, experience,
  training_days, training_setup, session_minutes, height_unit, weight_unit)
values
  ('00000000-0000-0000-0000-00000000000a', 'male', extract(year from current_date)::int - 30, 180,
    'sedentary', 'beginner', '{1}', 'gym', 45, 'cm', 'kg'),
  ('00000000-0000-0000-0000-00000000000b', 'unspecified', extract(year from current_date)::int - 30,
    170, 'sedentary', 'beginner', '{1}', 'gym', 45, 'cm', 'kg');
insert into public.weight_entries (user_id, weight_kg) values
  ('00000000-0000-0000-0000-00000000000a', 80),
  ('00000000-0000-0000-0000-00000000000b', 70);

-- A 30-minute log of each.
insert into public.workout_logs (id, user_id, name, started_at, started_on, finished_at)
  overriding system value values
  (800, '00000000-0000-0000-0000-00000000000a', 'Push', now() - interval '40 minutes', current_date, now() - interval '10 minutes'),
  (801, '00000000-0000-0000-0000-00000000000b', 'Legs', now() - interval '40 minutes', current_date, now() - interval '10 minutes');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select ok(
  public.set_workout_health(800, 130, 168, null, 'Zepp', array[95, 120.4, 400, null, 168]),
  'A whole read keeps its samples'
);
select is(
  (select heart_rate_samples from public.workout_logs where id = 800),
  array[95, 120, null, null, 168]::smallint[],
  'Rounded, and a value no person can have is none'
);
-- Keytel for a man of 30 at 80 kg and 130 bpm: (-55.0969 + 0.6309*130 + 0.1988*80 + 0.2017*30)
-- / 4.184 = 11.68 kcal a minute, for 30 minutes.
select is(
  (select heart_rate_kcal from public.workout_logs where id = 800),
  350,
  'The calories are estimated from the heart rate, the age, sex, weight and minutes'
);
select is(
  (select heart_rate_kcal from public.workout_log_summaries where id = 800),
  350,
  'And shown in the summary'
);
select ok(
  not public.set_workout_health(800, 130, 168, null, 'Zepp'),
  'A later read without samples changes nothing'
);
select is(
  (select cardinality(heart_rate_samples) from public.workout_logs where id = 800),
  5,
  'And keeps the samples'
);
select ok(
  not public.set_workout_health(800, 130, 168, null, 'Zepp',
    (select array_agg(120) from generate_series(1, 200))),
  'Samples running past the workout''s end are left out'
);
select ok(
  not public.set_workout_health(800, 130, 168, null, 'Zepp', array[10, 300]),
  'Samples with no heart rate a person can have are left out'
);
select ok(
  not public.set_workout_health(800, null, null, 400, 'iPhone', array[120, 130]),
  'Samples without a whole read are left out'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select public.set_workout_health(801, 120, 150);
-- The mean of Keytel's two formulas for 30 years, 70 kg and 120 bpm, for 30 minutes.
select is(
  (select heart_rate_kcal from public.workout_logs where id = 801),
  (round(30 * (((-55.0969 + 0.6309 * 120 + 0.1988 * 70 + 0.2017 * 30)
    + (-20.4022 + 0.4472 * 120 - 0.1263 * 70 + 0.074 * 30)) / 2) / 4.184))::integer,
  'A sex not given takes the mean of the two formulas'
);
select is(
  (select heart_rate_samples from public.workout_logs where id = 800),
  null::smallint[],
  'Another user''s samples are not to be read'
);

-- When each set was done.
reset role;
insert into public.workouts (id, user_id, name, type, estimated_minutes)
  overriding system value values (900, '00000000-0000-0000-0000-00000000000a', null, 'push', 45);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select set_config('test.log', public.log_workout(jsonb_build_object(
  'workoutId', 900,
  'startedAt', now() - interval '1 hour',
  'startedOn', current_date,
  'finishedAt', now() - interval '10 minutes',
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 50, 'doneAt', now() - interval '50 minutes'),
      jsonb_build_object('seconds', 45, 'doneAt', now() - interval '3 hours'),
      jsonb_build_object('seconds', 40, 'doneAt', 'soon'),
      jsonb_build_object('seconds', 30))))
))::text, true);
select results_eq(
  $$ select done_at is not null from public.logged_sets
     where log_id = current_setting('test.log')::bigint order by set_position $$,
  $$ values (true), (false), (false), (false) $$,
  'A set keeps when it was done, if within its workout and a time'
);

select public.edit_workout_log(current_setting('test.log')::bigint, jsonb_build_object(
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 55),
      jsonb_build_object('seconds', 45, 'doneAt', now() - interval '20 minutes'))))
));
select results_eq(
  $$ select seconds, done_at is not null from public.logged_sets
     where log_id = current_setting('test.log')::bigint order by set_position $$,
  $$ values (55, true), (45, true) $$,
  'An edit keeps the time a set had at its place, and takes the one it sends'
);
select is(
  (select done_at from public.logged_sets
   where log_id = current_setting('test.log')::bigint and set_position = 0)
    between now() - interval '51 minutes' and now() - interval '49 minutes',
  true,
  'The kept time is the set''s own'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.set_workout_health(bigint, numeric, numeric, numeric, text, numeric[])', 'execute'),
  'Without a session nobody can keep samples'
);
select ok(
  not has_function_privilege('authenticated', 'public.heart_rate_kcal(numeric, numeric, numeric, numeric, public.sex)', 'execute'),
  'The estimate is the server''s alone'
);

select * from finish();
rollback;
