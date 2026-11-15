-- Supersets (#141, ADR 0137): save_workout() takes two or more exercises next to each other with
-- one rest, counts that rest once per round, logs keep each set's superset, and a coach's edit
-- splits up a superset it leaves with one exercise.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
-- Its helpers are called as the signed-in user, while new functions are closed to clients
-- (#529, ADR 0126): only they are opened, and go with the test's session.
grant execute on all functions in schema pg_temp to public;

-- An exercise of 3 sets of 8 to 12 reps, resting 90 seconds, in the superset `superset` or none.
create function pg_temp.exercise(
  exercise_id text, superset integer default null, sets integer default 3, rest integer default 90
) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'exerciseId', exercise_id, 'sets', sets, 'restSeconds', rest,
    'target', jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)),
    'superset', superset
  ));
$$;
create function pg_temp.workout(exercises jsonb) returns jsonb language sql as $$
  select jsonb_build_object('name', 'Upper', 'weekdays', '[]'::jsonb, 'exercises', exercises);
$$;
grant execute on all functions in schema pg_temp to public;

-- The time, before signing in, as workout_minutes() is closed to clients. A set of 12 reps takes
-- 36 seconds, and each exercise a minute more; the warm-up five minutes.
select is(
  public.workout_minutes(jsonb_build_array(
    pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip'), pg_temp.exercise('Bent_Over_Barbell_Row')
  )),
  17::smallint,
  'Two exercises on their own each rest between their sets: 300 + 2 × (108 + 180 + 60) seconds'
);
select is(
  public.workout_minutes(jsonb_build_array(
    pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1), pg_temp.exercise('Bent_Over_Barbell_Row', 1)
  )),
  14::smallint,
  'A superset rests once between its rounds: 300 + 2 × (108 + 60) + 2 × 90 seconds'
);
select is(
  public.workout_minutes(jsonb_build_array(
    pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1, 5),
    pg_temp.exercise('Bent_Over_Barbell_Row', 1, 3)
  )),
  18::smallint,
  'A superset has as many rounds as its exercise with the most sets: 300 + 240 + 168 + 4 × 90'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- A superset of bench press and row, then the military press on its own.
select set_config('test.workout', public.save_workout(pg_temp.workout(jsonb_build_array(
  pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1),
  pg_temp.exercise('Bent_Over_Barbell_Row', 1),
  pg_temp.exercise('Standing_Military_Press', null, 3, 75)
)), current_date)::text, true);

-- saved_workout() and edited_workout_exercises() are closed to clients too, so they are called
-- without the role, as the caller still.
reset role;

select results_eq(
  $$ select exercise_id, superset from public.workout_exercises
     where workout_id = current_setting('test.workout')::bigint order by position $$,
  $$ values ('Barbell_Bench_Press_-_Medium_Grip', 1::smallint), ('Bent_Over_Barbell_Row', 1::smallint),
       ('Standing_Military_Press', null::smallint) $$,
  'The workout keeps which exercises are in the superset'
);
select is(
  (select jsonb_agg(e -> 'superset') from jsonb_array_elements(
    public.saved_workout(current_setting('test.workout')::bigint) -> 'exercises') e),
  '[1, 1, null]'::jsonb,
  'saved_workout() gives each exercise its superset, and none to one on its own'
);
select is(
  (select estimated_minutes from public.workouts where id = current_setting('test.workout')::bigint),
  public.workout_minutes(public.saved_workout(current_setting('test.workout')::bigint) -> 'exercises'),
  'The saved workout''s time counts the superset''s rest once per round'
);

-- Supersets that are not one.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1),
       pg_temp.exercise('Bent_Over_Barbell_Row'))), current_date) $$,
  'BB057', null,
  'A superset of one exercise is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1),
       pg_temp.exercise('Standing_Military_Press'),
       pg_temp.exercise('Bent_Over_Barbell_Row', 1))), current_date) $$,
  'BB057', null,
  'A superset of exercises apart is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1, 3, 90),
       pg_temp.exercise('Bent_Over_Barbell_Row', 1, 3, 60))), current_date) $$,
  'BB057', null,
  'A superset whose exercises rest differently is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip') || '{"superset": "a"}',
       pg_temp.exercise('Bent_Over_Barbell_Row') || '{"superset": "a"}')), current_date) $$,
  'BB057', null,
  'A superset that is not a whole number is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip') || '{"superset": 0}',
       pg_temp.exercise('Bent_Over_Barbell_Row') || '{"superset": 0}')), current_date) $$,
  'BB057', null,
  'A superset numbered 0 is refused'
);
select lives_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1),
       pg_temp.exercise('Bent_Over_Barbell_Row', 1),
       pg_temp.exercise('Standing_Military_Press', 2),
       pg_temp.exercise('Pullups', 2))), current_date) $$,
  'Two supersets side by side are two'
);

-- A log keeps each set's superset, as log_workout() and edit_workout_log() take it.
create function pg_temp.log_exercises(first_superset integer, second_superset integer)
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object('exerciseId', 'Barbell_Bench_Press_-_Medium_Grip',
      'superset', first_superset, 'sets', jsonb_build_array(
        jsonb_build_object('weightKg', 80, 'reps', 8), jsonb_build_object('weightKg', 80, 'reps', 7)))),
    jsonb_strip_nulls(jsonb_build_object('exerciseId', 'Bent_Over_Barbell_Row',
      'superset', second_superset, 'sets', jsonb_build_array(
        jsonb_build_object('weightKg', 60, 'reps', 10)))),
    jsonb_build_object('exerciseId', 'Standing_Military_Press', 'sets', jsonb_build_array(
      jsonb_build_object('weightKg', 40, 'reps', 10)))
  );
$$;
grant execute on all functions in schema pg_temp to public;

select set_config('test.log', public.log_workout(jsonb_build_object(
  'workoutId', current_setting('test.workout')::bigint,
  'startedAt', now() - interval '1 hour',
  'finishedAt', now() - interval '10 minutes',
  'exercises', pg_temp.log_exercises(1, 1)
))::text, true);
select results_eq(
  $$ select exercise_id, set_position, superset from public.logged_sets
     where log_id = current_setting('test.log')::bigint order by exercise_position, set_position $$,
  $$ values ('Barbell_Bench_Press_-_Medium_Grip', 0::smallint, 1::smallint),
       ('Barbell_Bench_Press_-_Medium_Grip', 1::smallint, 1::smallint),
       ('Bent_Over_Barbell_Row', 0::smallint, 1::smallint),
       ('Standing_Military_Press', 0::smallint, null::smallint) $$,
  'A logged set keeps the superset its exercise was in'
);
select throws_ok(
  $$ select public.log_workout(jsonb_build_object(
       'workoutId', current_setting('test.workout')::bigint,
       'startedAt', now() - interval '1 hour', 'finishedAt', now() - interval '10 minutes',
       'exercises', pg_temp.log_exercises(1, null))) $$,
  'BB057', null,
  'A log with a superset of one exercise is refused'
);

select lives_ok(
  $$ select public.edit_workout_log(current_setting('test.log')::bigint,
       jsonb_build_object('exercises', pg_temp.log_exercises(null, null))) $$,
  'An edit can split up a logged superset'
);
select is(
  (select count(*)::integer from public.logged_sets
   where log_id = current_setting('test.log')::bigint and superset is not null),
  0,
  'The edited log keeps the supersets it was sent'
);
select lives_ok(
  $$ select public.edit_workout_log(current_setting('test.log')::bigint,
       jsonb_build_object('exercises', pg_temp.log_exercises(2, 2))) $$,
  'An edit can join logged exercises into a superset'
);

-- A coach's edit keeps a swapped exercise in its superset and splits up one left with one.
reset role;
select is(
  public.edited_workout_exercises(
    public.saved_workout(current_setting('test.workout')::bigint),
    '{"swaps": [{"replace": "Bent_Over_Barbell_Row", "with": "Pullups", "sets": 3,
       "target": {"reps": {"min": 6, "max": 10}}}]}'
  ) -> 1 -> 'superset',
  '1'::jsonb,
  'An exercise swapped in takes the place of the one it replaces in its superset'
);
select is(
  (select jsonb_agg(e -> 'superset') from jsonb_array_elements(public.edited_workout_exercises(
    public.saved_workout(current_setting('test.workout')::bigint),
    '{"remove": ["Bent_Over_Barbell_Row"]}')) e),
  '[null, null]'::jsonb,
  'A superset that a removal leaves with one exercise is split up'
);
select is(
  (select jsonb_agg(e -> 'superset') from jsonb_array_elements(public.edited_workout_exercises(
    jsonb_build_object('exercises', jsonb_build_array(
      pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip', 1),
      pg_temp.exercise('Bent_Over_Barbell_Row', 1),
      pg_temp.exercise('Standing_Military_Press', 1))),
    '{"remove": ["Bent_Over_Barbell_Row"], "add": [{"exerciseId": "Pullups", "sets": 3,
       "target": {"reps": {"min": 6, "max": 10}}}]}')) e),
  '[1, 1, null]'::jsonb,
  'A superset of three keeps the two left, and an exercise added joins none'
);

select * from finish();
rollback;
