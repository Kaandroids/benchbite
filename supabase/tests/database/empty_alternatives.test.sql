-- Empty alternatives and copies (#367, ADR 0064): an alternative is added empty or as a copy of
-- any alternative of the workout, within the cap, and an empty one can be put in use, which leaves
-- the workout without exercises until it is edited. Such a workout keeps its last other
-- alternative.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

create function pg_temp.id(name text) returns bigint language sql as $$
  select i.id from ids i where i.name = $1;
$$;

-- A's Legs is planned on every day since three days ago, its plan kept through then, so that the
-- days in between are kept when an empty alternative is put in use.
insert into public.planned_days_kept (user_id, through) values
  ('00000000-0000-0000-0000-00000000000a', current_date - 3);
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays)
overriding system value values
  (911, '00000000-0000-0000-0000-00000000000a', 'Legs', 30, '{1,2,3,4,5,6,7}');
insert into public.workout_exercises (
  workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max,
  target_seconds, rest_seconds
) values
  (911, '00000000-0000-0000-0000-00000000000a', 0, 'Barbell_Squat', 4, 6, 8, null, 120),
  (911, '00000000-0000-0000-0000-00000000000a', 1, 'Plank', 3, null, null, 45, 60);
set local session_replication_role = origin;

create function pg_temp.gym() returns jsonb language sql as $$
  select '[
    {"exerciseId": "Barbell_Squat", "sets": 4, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}},
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}
  ]'::jsonb;
$$;

create function pg_temp.home() returns jsonb language sql as $$
  select '[
    {"exerciseId": "Bodyweight_Walking_Lunge", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 10, "max": 12}}}
  ]'::jsonb;
$$;

-- The caller's workout as saved_workout() reads it, which clients may not call.
create function pg_temp.saved(workout_id bigint) returns jsonb language sql security definer as $$
  select public.saved_workout(workout_id);
$$;

create function pg_temp.exercises_of(alternative_id bigint) returns jsonb language sql as $$
  select a.exercises from public.workout_alternatives a where a.id = alternative_id;
$$;

-- B has a workout with alternatives too.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
insert into ids select 'arms', public.save_workout(
  '{"name": "Arms", "weekdays": [], "exercises": [
    {"exerciseId": "Hammer_Curls", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 10, "max": 12}}}
  ]}',
  current_date
);
insert into ids select 'arms copy', public.add_workout_alternative(pg_temp.id('arms'), current_date);

-- ----------------------------------------------------------------------------------------------
-- Adding an empty one

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'empty', public.add_workout_alternative(911, current_date, 'Home', '[]');
select results_eq(
  $$ select position, name, in_use, exercises from public.workout_alternatives
     where workout_id = 911 order by position $$,
  $$ values (1::smallint, null::text, true, null::jsonb), (2::smallint, 'Home', false, '[]'::jsonb) $$,
  'An alternative added with no exercises is empty, after the workout''s own'
);
select is(pg_temp.saved(911) -> 'exercises', pg_temp.gym(), 'and leaves the workout as it is');

-- ----------------------------------------------------------------------------------------------
-- Duplicating

insert into ids select 'gym copy', public.add_workout_alternative(
  911, current_date, null, null,
  (select id from public.workout_alternatives where workout_id = 911 and in_use)
);
select is(pg_temp.exercises_of(pg_temp.id('gym copy')), pg_temp.gym(),
  'A copy of the one in use has the workout''s exercises, sets and rests');

insert into ids select 'empty copy', public.add_workout_alternative(
  911, current_date, 'Copy', null, pg_temp.id('empty')
);
select results_eq(
  $$ select position, name, exercises from public.workout_alternatives where id = pg_temp.id('empty copy') $$,
  $$ values (4::smallint, 'Copy', '[]'::jsonb) $$,
  'A copy of one not in use has its exercises, last and named as given'
);

select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, pg_temp.home(), pg_temp.id('empty')) $$,
  '22023', null,
  'An alternative is a copy or has exercises, not both'
);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, null, pg_temp.id('arms copy')) $$,
  'P0002', null,
  'A copy is of an alternative of the same workout'
);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, null, -1) $$,
  'P0002', null,
  'that exists'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, null, pg_temp.id('empty')) $$,
  'BB006', null,
  'A user cannot copy another user''s alternative'
);
select throws_ok(
  $$ select public.add_workout_alternative(pg_temp.id('arms'), current_date, null, null, pg_temp.id('empty')) $$,
  'P0002', null,
  'not even into their own workout'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'home', public.add_workout_alternative(911, current_date, 'Gym 2', pg_temp.home());
select is(pg_temp.exercises_of(pg_temp.id('home')), pg_temp.home(),
  'An alternative added with exercises keeps them, as Bite''s and the editor''s lists are');
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, null, pg_temp.id('home')) $$,
  'BB041', null,
  'A copy counts against the 5 alternatives'
);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, '[]') $$,
  'BB041', null,
  'and so does an empty one'
);

-- ----------------------------------------------------------------------------------------------
-- Using an empty one

select public.use_workout_alternative(pg_temp.id('empty'), current_date);
select is(
  pg_temp.saved(911),
  jsonb_build_object('id', 911, 'name', 'Legs', 'weekdays', '[1,2,3,4,5,6,7]'::jsonb, 'exercises', '[]'::jsonb),
  'An empty alternative put in use leaves the workout without exercises, with its name and days'
);
select is((select estimated_minutes from public.workouts where id = 911), 5::smallint,
  'and its time the warm-up alone');
select ok((select in_use from public.workout_alternatives where id = pg_temp.id('empty')),
  'It is the one in use');
select is(
  (select exercises from public.workout_alternatives where workout_id = 911 and position = 1),
  pg_temp.gym(),
  'and the one in use before keeps its exercises'
);
select results_eq(
  $$ select day - current_date, name from public.planned_days order by day $$,
  $$ values (-2, 'Legs'), (-1, 'Legs') $$,
  'The days before today keep the plan they had'
);
select throws_ok(
  $$ select public.use_workout_alternative(pg_temp.id('home'), current_date + 5) $$,
  '22023', null,
  'An alternative is put in use on the device''s today only'
);

select public.delete_workout_alternative(pg_temp.id('empty copy'));
insert into ids select 'empty again', public.add_workout_alternative(
  911, current_date, null, null, pg_temp.id('empty')
);
select is(pg_temp.exercises_of(pg_temp.id('empty again')), '[]'::jsonb,
  'A copy of an empty one in use is empty');

select public.use_workout_alternative(pg_temp.id('home'), current_date);
select is(pg_temp.saved(911) -> 'exercises', pg_temp.home(),
  'Another put in use after it gives the workout its exercises');
-- 3 sets of 12 reps at 3 seconds, 2 rests of 60 and a minute to move on, after 5 to warm up.
select is((select estimated_minutes from public.workouts where id = 911), 10::smallint,
  'and its time, counted as save_workout() counts it');
select is(pg_temp.exercises_of(pg_temp.id('empty')), '[]'::jsonb,
  'and the empty one stays empty');

select public.use_workout_alternative(pg_temp.id('empty'), current_date);
select throws_ok(
  $$ select public.save_workout(
    '{"id": 911, "name": "Legs", "weekdays": [1,2,3,4,5,6,7], "exercises": []}', current_date
  ) $$,
  'BB008', null,
  'A workout is still saved with at least one exercise'
);

-- ----------------------------------------------------------------------------------------------
-- Keeping the exercises of a workout whose empty alternative is in use

select public.use_workout_alternative(pg_temp.id('empty'), current_date);
select public.delete_workout_alternative(pg_temp.id('gym copy'));
select public.delete_workout_alternative(pg_temp.id('home'));
select lives_ok(
  $$ select public.delete_workout_alternative(pg_temp.id('empty again')) $$,
  'With an empty alternative in use, the others can be deleted down to one'
);
select throws_ok(
  $$ select public.delete_workout_alternative(
    (select id from public.workout_alternatives where workout_id = 911 and position = 1)
  ) $$,
  'BB043', null,
  'but not the last, which would leave the workout without exercises or alternatives'
);
select is(
  (select count(*)::integer from public.workout_alternatives where workout_id = 911), 2,
  'It keeps both'
);

select * from finish();
rollback;
