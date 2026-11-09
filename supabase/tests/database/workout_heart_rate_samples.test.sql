-- A workout's heart rate over its time and its sets' times (#480, ADR 0104): set_workout_health()
-- keeps the samples with a whole read, cleaned and within the workout, and estimates the calories
-- from the heart rate; log_workout() and edit_workout_log() keep when each set was done.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

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
-- Dated before any log here, which may start yesterday when the tests run just after midnight.
insert into public.weight_entries (user_id, weight_kg, measured_on) values
  ('00000000-0000-0000-0000-00000000000a', 80, current_date - 10),
  ('00000000-0000-0000-0000-00000000000b', 70, current_date - 10);

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
  (select kcal from public.workout_log_summaries where id = 800),
  350,
  'And shown in the summary, as the watch measured no calories'
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
-- A 12-hour log, as long as a workout may be.
insert into public.workout_logs (id, user_id, name, started_at, started_on, finished_at)
  overriding system value values
  (802, '00000000-0000-0000-0000-00000000000a', 'Hike', now() - interval '13 hours', current_date, now() - interval '1 hour');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select ok(
  public.set_workout_health(802, 120, 150, null, 'Zepp',
    (select array_agg(120) from generate_series(1, 4321))),
  'A 12-hour read keeps its heart rate, though its samples are one too many'
);
select is(
  (select heart_rate_samples from public.workout_logs where id = 802),
  null::smallint[],
  'And leaves out the samples beyond 4320'
);

-- Plank twice, as a workout may have one exercise at two places.
select set_config('test.log', public.log_workout(jsonb_build_object(
  'workoutId', 900,
  'startedAt', now() - interval '1 hour',
  'startedOn', current_date,
  'finishedAt', now() - interval '10 minutes',
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 50, 'doneAt', now() - interval '50 minutes'),
      jsonb_build_object('seconds', 45, 'doneAt', now() - interval '3 hours'),
      jsonb_build_object('seconds', 40, 'doneAt', 'soon'))),
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 30, 'doneAt', now() - interval '15 minutes'))))
))::text, true);
select results_eq(
  $$ select done_at is not null from public.logged_sets
     where log_id = current_setting('test.log')::bigint order by exercise_position, set_position $$,
  $$ values (true), (false), (false), (true) $$,
  'A set keeps when it was done, if within its workout and a time'
);

create function pg_temp.minutes_ago() returns table (seconds integer, minutes integer)
language sql as $$
  select s.seconds, round(extract(epoch from now() - s.done_at) / 60)::integer
  from public.logged_sets s
  where s.log_id = current_setting('test.log')::bigint
  order by s.exercise_position, s.set_position;
$$;

-- An app that sends no times: each set keeps its own, also with one exercise at two places.
select public.edit_workout_log(current_setting('test.log')::bigint, jsonb_build_object(
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 55), jsonb_build_object('seconds', 45), jsonb_build_object('seconds', 40))),
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 35))))
));
select results_eq(
  $$ select * from pg_temp.minutes_ago() $$,
  $$ values (55, 50), (45, null), (40, null), (35, 15) $$,
  'An edit without times keeps each set''s own, by the exercise''s place too'
);

-- An app that sends no times, with a set removed: that exercise's times would move, so it keeps none.
select public.edit_workout_log(current_setting('test.log')::bigint, jsonb_build_object(
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 45), jsonb_build_object('seconds', 40))),
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 35))))
));
select results_eq(
  $$ select * from pg_temp.minutes_ago() $$,
  $$ values (45, null), (40, null), (35, 15) $$,
  'An exercise whose sets changed keeps no times, and the others keep theirs'
);

-- An app that sends times: a set added in the edit has none.
select public.edit_workout_log(current_setting('test.log')::bigint, jsonb_build_object(
  'exercises', jsonb_build_array(
    jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
      jsonb_build_object('seconds', 55, 'doneAt', now() - interval '50 minutes'),
      jsonb_build_object('seconds', 20))))
));
select results_eq(
  $$ select * from pg_temp.minutes_ago() $$,
  $$ values (55, 50), (20, null) $$,
  'An edit with times takes them as sent, and a set added without one has none'
);

-- A calm workout: below 90 beats a minute the formula gives no estimate, and the minutes' shows.
reset role;
insert into public.workout_logs (id, user_id, name, started_at, started_on, finished_at, estimated_kcal)
  overriding system value values
  (803, '00000000-0000-0000-0000-00000000000a', 'Mobility', now() - interval '70 minutes', current_date, now() - interval '10 minutes', 400);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.set_workout_health(803, 70, 95);
select results_eq(
  $$ select l.heart_rate_kcal, s.kcal, s.kcal_source::text
     from public.workout_logs l join public.workout_log_summaries s using (id) where l.id = 803 $$,
  $$ values (null::integer, 400, 'minutes') $$,
  'A heart rate below the formula''s range gives no estimate, and the minutes'' shows'
);

-- An app that sends no day: the 5 MET estimate takes the latest weight, not any.
reset role;
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 95, current_date - 400);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select set_config('test.dayless', public.log_workout(jsonb_build_object(
  'workoutId', 900,
  'startedAt', now() - interval '2 hours',
  'finishedAt', now() - interval '1 hour',
  'exercises', jsonb_build_array(jsonb_build_object('exerciseId', 'Plank', 'sets',
    jsonb_build_array(jsonb_build_object('seconds', 60)))))
)::text, true);
select is(
  (select estimated_kcal from public.workout_logs where id = current_setting('test.dayless')::bigint),
  -- 5 MET at 80 kg, the latest weight, for 60 minutes.
  400,
  'A log without its day takes the latest weight for its estimate'
);

-- Which calories to show.
select set_eq(
  $$ select id, kcal, kcal_source::text from public.workout_log_summaries
     where id in (800, 802) or id = current_setting('test.log')::bigint $$,
  $$ values (800::bigint, 350, 'heart_rate'),
            (802::bigint, (select heart_rate_kcal from public.workout_logs where id = 802), 'heart_rate'),
            (current_setting('test.log')::bigint,
              (select estimated_kcal from public.workout_logs where id = current_setting('test.log')::bigint),
              'minutes') $$,
  'The summary shows the heart rate''s calories before the minutes'''
);
select public.set_workout_health(800, 130, 168, 412, 'Zepp');
select results_eq(
  $$ select kcal, kcal_source::text from public.workout_log_summaries where id = 800 $$,
  $$ values (412, 'watch') $$,
  'And the watch''s before all'
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

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  public.weight_on('00000000-0000-0000-0000-00000000000a', current_date),
  null::numeric,
  'Nobody reads another user''s weight through weight_on()'
);
reset role;

-- Planned workouts take the latest weight, also one dated after the server's day.
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000b', 60, current_date + 1);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  public.my_strength_kcal_per_minute(),
  public.strength_kcal_per_minute(60),
  'Planned workouts take the latest weight'
);
reset role;

select * from finish();
rollback;
