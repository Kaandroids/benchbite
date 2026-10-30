-- save_workout() creates and replaces only the caller's workouts, keeps them within the caller's
-- limits, checks each target against what the exercise records, and estimates the length. Users delete only their own workouts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.exercise(exercise_id text, target jsonb, sets integer default 3) returns jsonb
language sql as $$
  select jsonb_build_object('exerciseId', exercise_id, 'sets', sets, 'target', target, 'restSeconds', 60);
$$;

create function pg_temp.workout(exercises jsonb, more jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('name', 'Arms', 'weekdays', jsonb_build_array(2), 'exercises', exercises)
    || more;
$$;

-- Hammer curls record reps, planks a time, and stationary rowing a distance and a time.
create function pg_temp.valid() returns jsonb language sql as $$
  select pg_temp.workout(jsonb_build_array(
    pg_temp.exercise('Hammer_Curls', '{"reps": {"min": 10, "max": 12}}'),
    pg_temp.exercise('Plank', '{"seconds": 45, "meters": null}', 2),
    pg_temp.exercise('Rowing_Stationary', '{"seconds": null, "meters": 2000}', 1)
  ));
$$;

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.save_workout(pg_temp.valid(), current_date) $$,
  '42501', null,
  'Anon cannot save a workout'
);
select throws_ok(
  $$ select * from public.workout_limits() $$,
  '42501', null,
  'Anon cannot ask for the limits'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- FREE_WORKOUT_EXERCISES and FREE_WORKOUTS in supabase/functions/_shared/plan/limits.ts hold the
-- same numbers for the plan builder; change them together.
select results_eq(
  $$ select * from public.workout_limits() $$,
  $$ values (20, 3, 5) $$,
  'Users may have 3 workouts with 20 exercises each'
);

-- Rejected workouts save nothing.
select throws_ok(
  $$ select public.save_workout(pg_temp.workout('[]'), current_date) $$,
  'BB008', 'A workout needs 1 to 20 exercises',
  'A workout without exercises is rejected'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout((
       select jsonb_agg(pg_temp.exercise('Hammer_Curls', '{"reps": {"min": 8, "max": 12}}'))
       from generate_series(1, 21)
     )), current_date) $$,
  'BB008', 'A workout needs 1 to 20 exercises',
  'A workout with more than 20 exercises is rejected'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Plank', '{"reps": {"min": 8, "max": 12}}'))), current_date) $$,
  'BB007', 'A target does not suit its exercise',
  'A rep target for an exercise that records a time is rejected'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Hammer_Curls', '{"seconds": 30, "meters": null}'))), current_date) $$,
  'BB007', 'A target does not suit its exercise',
  'A time target for an exercise that records reps is rejected'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Plank', '{"seconds": 30, "meters": 400}'))), current_date) $$,
  'BB007', 'A target does not suit its exercise',
  'A distance target for an exercise that records no distance is rejected'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Rowing_Stationary', '{"seconds": null, "meters": null}'))), current_date) $$,
  'BB007', 'A target does not suit its exercise',
  'An empty target is rejected'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('No_Such_Exercise', '{"reps": {"min": 8, "max": 12}}'))), current_date) $$,
  '23503', null,
  'An unknown exercise is rejected'
);
select is_empty(
  $$ select 1 from public.workouts where name = 'Arms' $$,
  'Rejected workouts are not saved'
);

-- A valid workout is saved with its exercises in order.
select set_config('test.workout_id', public.save_workout(pg_temp.valid(), current_date)::text, true);
select results_eq(
  $$ select name, weekdays, active, estimated_minutes::integer from public.workouts
     where id = current_setting('test.workout_id')::bigint $$,
  $$ values ('Arms', '{2}'::smallint[], true, 27) $$,
  'A new workout is saved, active, with its estimated length'
);
select results_eq(
  $$ select position::integer, exercise_id, target_reps_max::integer, target_seconds::integer,
       target_meters
     from public.workout_exercises
     where workout_id = current_setting('test.workout_id')::bigint order by position $$,
  $$ values (0, 'Hammer_Curls', 12, null::integer, null::integer),
            (1, 'Plank', null, 45, null),
            (2, 'Rowing_Stationary', null, null, 2000) $$,
  'The exercises are saved in order with their targets'
);
select lives_ok(
  $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
       pg_temp.exercise('Rowing_Stationary', '{"seconds": 600, "meters": 2000}', 1)),
       '{"name": "Row"}'), current_date) $$,
  'A time and a distance can be set together'
);

-- Saving again replaces the workout but keeps it switched off.
select public.set_workout_active(current_setting('test.workout_id')::bigint, false, current_date);
select is(
  public.save_workout(pg_temp.workout(
    jsonb_build_array(pg_temp.exercise('Barbell_Squat', '{"reps": {"min": 5, "max": 5}}')),
    jsonb_build_object('id', current_setting('test.workout_id')::bigint, 'name', 'Legs', 'weekdays', '[]'::jsonb)
  ), current_date),
  current_setting('test.workout_id')::bigint,
  'Saving an existing workout keeps its id'
);
select results_eq(
  $$ select name, weekdays, active from public.workouts
     where id = current_setting('test.workout_id')::bigint $$,
  $$ values ('Legs', '{}'::smallint[], false) $$,
  'The name and weekdays are replaced, and the workout stays inactive'
);
select results_eq(
  $$ select exercise_id from public.workout_exercises
     where workout_id = current_setting('test.workout_id')::bigint $$,
  $$ values ('Barbell_Squat') $$,
  'The exercises are replaced'
);

-- A fourth workout is rejected, archived ones counted.
select lives_ok(
  $$ select public.save_workout(pg_temp.valid(), current_date) $$,
  'Users can have up to 3 workouts'
);
select throws_ok(
  $$ select public.save_workout(pg_temp.valid(), current_date) $$,
  'BB009', 'A user can have up to 3 workouts',
  'A fourth workout is rejected, the inactive one counted'
);
select public.delete_workout(w.id, current_date) from public.workouts w where w.name = 'Arms';

-- Other users can neither replace nor delete the workout.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format(
    $$ select public.save_workout(pg_temp.workout(jsonb_build_array(
         pg_temp.exercise('Hammer_Curls', '{"reps": {"min": 8, "max": 12}}')), '{"id": %s}'), current_date) $$,
    current_setting('test.workout_id')
  ),
  'BB006', 'Workout not found',
  'Users cannot save over another user''s workout'
);
select throws_ok(
  $$ select public.delete_workout(current_setting('test.workout_id')::bigint, current_date) $$,
  'BB006', null,
  'Users cannot delete another user''s workout through the function'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select isnt_empty(
  $$ select 1 from public.workouts where id = current_setting('test.workout_id')::bigint $$,
  'Users cannot delete another user''s workout'
);

-- Owners delete their workout and its exercises with it.
select public.delete_workout(current_setting('test.workout_id')::bigint, current_date);
select is_empty(
  $$ select 1 from public.workouts where id = current_setting('test.workout_id')::bigint $$,
  'Users can delete their own workout'
);
reset role;
select is_empty(
  $$ select 1 from public.workout_exercises
     where workout_id = current_setting('test.workout_id')::bigint $$,
  'Its exercises are deleted with it'
);

-- The same workout as 'estimates a workout as save_workout() does' in
-- supabase/functions/_shared/plan/session_test.ts, which the plan builder estimates. Change both
-- together (ADR 0017).
reset role;
select is(
  public.exercise_seconds(pg_temp.exercise('Hammer_Curls', '{"reps": {"min": 10, "max": 12}}')),
  288,
  'Sets of reps take as long as in the plan builder'
);
select is(
  public.exercise_seconds(pg_temp.exercise('Plank', '{"seconds": 45, "meters": null}', 2)),
  210,
  'Timed sets take as long as in the plan builder'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select set_config('test.same_id', public.save_workout(
  pg_temp.workout(jsonb_build_array(
    pg_temp.exercise('Hammer_Curls', '{"reps": {"min": 10, "max": 12}}'),
    pg_temp.exercise('Plank', '{"seconds": 45, "meters": null}', 2)
  ), '{"name": "Same as the plan builder"}')
, current_date)::text, true);
select is(
  (select estimated_minutes::integer from public.workouts
   where id = current_setting('test.same_id')::bigint),
  14,
  'A workout of reps and a time takes as long as in the plan builder'
);

-- A hand-made workout has no slot, even when one is sent.
select set_config('test.slot_id', public.save_workout(
  pg_temp.workout(jsonb_build_array(
    pg_temp.exercise('Plank', '{"seconds": 45, "meters": null}') || '{"slot": "core"}'
  ), '{"name": "With a slot"}')
, current_date)::text, true);
select is(
  (select slot::text from public.workout_exercises
   where workout_id = current_setting('test.slot_id')::bigint),
  null,
  'A slot sent with a hand-made workout is not saved'
);

select * from finish();
rollback;
