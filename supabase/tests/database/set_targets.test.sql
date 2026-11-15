-- Set targets (#180, ADR 0138): save_workout() keeps the user's own targets for an exercise's sets
-- as they may be, and set_targets() gives each set its target: the own one, or one worked out from
-- the same set last time.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- An exercise of 3 sets of 8 to 12 reps, or of 45 seconds when `timed`, with the own targets
-- `targets`.
create function pg_temp.exercise(
  exercise_id text, targets jsonb default null, timed boolean default false
) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'exerciseId', exercise_id, 'sets', 3, 'restSeconds', 90,
    'target', case when timed then '{"seconds": 45}'::jsonb
      else jsonb_build_object('reps', jsonb_build_object('min', 8, 'max', 12)) end,
    'setTargets', targets
  ));
$$;
create function pg_temp.workout(exercises jsonb) returns jsonb language sql as $$
  select jsonb_build_object('name', 'Upper', 'weekdays', '[]'::jsonb, 'exercises', exercises);
$$;
-- A log of the workout `days` days ago, of the exercises' sets `exercises`.
create function pg_temp.log(days integer, exercises jsonb) returns bigint language sql as $$
  select public.log_workout(jsonb_build_object(
    'workoutId', current_setting('test.workout')::bigint,
    'startedAt', now() - make_interval(days => days, hours => 1),
    'finishedAt', now() - make_interval(days => days),
    'exercises', exercises
  ));
$$;
-- Its helpers are called as the signed-in user, while new functions are closed to clients
-- (#529, ADR 0126): only they are opened, and go with the test's session.
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- Own targets that are not ones.
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(pg_temp.exercise(
       'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 80, "reps": 10}, {"weightKg": 80, "reps": 10},
         {"weightKg": 80, "reps": 10}, {"weightKg": 80, "reps": 10}]'))), current_date) $$,
  'BB058', null,
  'More targets than the exercise has sets are refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(pg_temp.exercise(
       'Barbell_Bench_Press_-_Medium_Grip', '[]'))), current_date) $$,
  'BB058', null,
  'No targets at all are sent as none, not as an empty list'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(pg_temp.exercise(
       'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 80, "reps": 0}]'))), current_date) $$,
  'BB058', null,
  'A target of no reps is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(pg_temp.exercise(
       'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 80, "reps": "ten"}]'))), current_date) $$,
  'BB058', null,
  'A target of reps that are not a number is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(pg_temp.exercise(
       'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 80, "seconds": 30}]'))), current_date) $$,
  'BB058', null,
  'A target of a time for an exercise of reps is refused'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(pg_temp.exercise(
       'Barbell_Bench_Press_-_Medium_Grip', '[{"weightKg": 80, "reps": 10, "meters": 5}]'))), current_date) $$,
  'BB058', null,
  'A target with a value an exercise cannot have is refused'
);

-- The bench press with its own targets, the rest worked out from last time.
select set_config('test.workout', public.save_workout(pg_temp.workout(jsonb_build_array(
  pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip',
    '[{"weightKg": 80, "reps": 10}, {"weightKg": 85, "reps": 8}]'),
  pg_temp.exercise('Bent_Over_Barbell_Row'),
  pg_temp.exercise('Dumbbell_Bench_Press'),
  pg_temp.exercise('Pullups'),
  pg_temp.exercise('Plank', null, true),
  pg_temp.exercise('Standing_Military_Press')
)), current_date)::text, true);

-- The dumbbell bench press three times short of 8 reps in its first set, last time the newest.
select pg_temp.log(days, jsonb_build_array(
  jsonb_build_object('exerciseId', 'Dumbbell_Bench_Press', 'sets', jsonb_build_array(
    jsonb_build_object('weightKg', 20, 'reps', 6), jsonb_build_object('weightKg', 20, 'reps', 9)))
)) from (values (3), (2)) d (days);
select pg_temp.log(1, jsonb_build_array(
  jsonb_build_object('exerciseId', 'Bent_Over_Barbell_Row', 'sets', jsonb_build_array(
    jsonb_build_object('weightKg', 60, 'reps', 12), jsonb_build_object('weightKg', 60, 'reps', 10))),
  jsonb_build_object('exerciseId', 'Dumbbell_Bench_Press', 'sets', jsonb_build_array(
    jsonb_build_object('weightKg', 20, 'reps', 7), jsonb_build_object('weightKg', 20, 'reps', 9))),
  jsonb_build_object('exerciseId', 'Pullups', 'sets', jsonb_build_array(jsonb_build_object('reps', 10))),
  jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
    jsonb_build_object('seconds', 45), jsonb_build_object('seconds', 40)))
));

create temporary table targets on commit drop as
  select * from public.set_targets(current_setting('test.workout')::bigint);
grant select on targets to public;

select results_eq(
  $$ select set_position, weight_kg, reps, own from targets where exercise_position = 0
     order by set_position $$,
  $$ values (0::smallint, 80::numeric, 10, true), (1::smallint, 85, 8, true), (2::smallint, 85, 8, true) $$,
  'The own targets come first, the set after the last of them taking the last one''s'
);
select results_eq(
  $$ select set_position, weight_kg, reps, own from targets where exercise_position = 1
     order by set_position $$,
  $$ values (0::smallint, 62.5::numeric, 8, false), (1::smallint, 60, 11, false),
       (2::smallint, 60, 11, false) $$,
  'The top of the range reached, a step more for its bottom; otherwise a rep more, a set of more than last time from its last'
);
select results_eq(
  $$ select set_position, weight_kg, reps from targets where exercise_position = 2 order by set_position $$,
  $$ values (0::smallint, 18::numeric, 10), (1::smallint, 20, 10), (2::smallint, 20, 10) $$,
  'Three times short of the range, a dumbbell''s step less for its middle'
);
select results_eq(
  $$ select set_position, weight_kg, reps from targets where exercise_position = 3 order by set_position $$,
  $$ values (0::smallint, null::numeric, 11), (1::smallint, null, 11), (2::smallint, null, 11) $$,
  'Done with the body''s weight, a rep more'
);
select results_eq(
  $$ select set_position, reps, seconds from targets where exercise_position = 4 order by set_position $$,
  $$ values (0::smallint, null::integer, 50), (1::smallint, null, 45), (2::smallint, null, 45) $$,
  'A time reached, 5 seconds more; otherwise the target time'
);
select is_empty(
  $$ select 1 from targets where exercise_position = 5 $$,
  'An exercise never done has no targets, and starts from last time as before'
);

-- The rep range reached in the dumbbell bench press's first set: it goes up, not down, for
-- three times short no longer.
select pg_temp.log(0, jsonb_build_array(
  jsonb_build_object('exerciseId', 'Dumbbell_Bench_Press', 'sets', jsonb_build_array(
    jsonb_build_object('weightKg', 20, 'reps', 12)))
));
select results_eq(
  $$ select set_position, weight_kg, reps from public.set_targets(current_setting('test.workout')::bigint)
     where exercise_position = 2 order by set_position $$,
  $$ values (0::smallint, 22::numeric, 8), (1::smallint, 22, 8), (2::smallint, 22, 8) $$,
  'Last time alone counts once the range is reached'
);

-- saved_workout() is closed to clients, so it is called without the role, as the caller still.
reset role;
select is(
  (public.saved_workout(current_setting('test.workout')::bigint) -> 'exercises' -> 0 -> 'setTargets'),
  '[{"reps": 10, "weightKg": 80}, {"reps": 8, "weightKg": 85}]'::jsonb,
  'saved_workout() gives an exercise its own targets'
);
select ok(
  not (public.saved_workout(current_setting('test.workout')::bigint) -> 'exercises' -> 1 ? 'setTargets'),
  'saved_workout() gives none to an exercise without them'
);
select ok(
  not (public.edited_workout_exercises(
    public.saved_workout(current_setting('test.workout')::bigint),
    '{"swaps": [{"replace": "Barbell_Bench_Press_-_Medium_Grip", "with": "90_90_Hamstring", "sets": 3, "target": {"seconds": 45}}]}'
  ) -> 0 ? 'setTargets'),
  'An exercise a coach swaps in has none of the other''s own targets'
);
select is(
  public.edited_workout_exercises(
    public.saved_workout(current_setting('test.workout')::bigint),
    '{"remove": ["Bent_Over_Barbell_Row"]}'
  ) -> 0 -> 'setTargets',
  '[{"reps": 10, "weightKg": 80}, {"reps": 8, "weightKg": 85}]'::jsonb,
  'An exercise a coach leaves keeps its own targets'
);

-- The targets cleared: they are worked out from last time again.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  format($$ select public.save_workout(%L::jsonb || jsonb_build_object('id', %s), current_date) $$,
    pg_temp.workout(jsonb_build_array(pg_temp.exercise('Barbell_Bench_Press_-_Medium_Grip'))),
    current_setting('test.workout')),
  'A workout is saved again with its targets cleared'
);
select is_empty(
  $$ select 1 from public.set_targets(current_setting('test.workout')::bigint) $$,
  'An exercise never done without its own targets has none'
);

-- Another user's workout gives nothing.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ select 1 from public.set_targets(current_setting('test.workout')::bigint) $$,
  'The targets of another user''s workout are not given'
);
select ok(
  not has_function_privilege('anon', 'public.set_targets(bigint)', 'execute'),
  'set_targets() is closed to anyone signed out'
);
select ok(
  not has_function_privilege('authenticated', 'public.check_set_targets(jsonb)', 'execute'),
  'check_set_targets() is closed to clients'
);

select * from finish();
rollback;
