-- Alternatives of a workout (ADR 0061): added as a copy of the one in use or from a list that
-- save_workout() takes, at most 5, put in use through save_workout() with the days before today
-- kept, renamed, reordered and deleted, never the one in use. Only their owner reaches them, and
-- only through the functions.
begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

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
-- days in between are kept when an alternative is put in use.
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
insert into ids values ('legs', 911);

create function pg_temp.gym() returns jsonb language sql as $$
  select '[
    {"exerciseId": "Barbell_Squat", "sets": 4, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}},
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}
  ]'::jsonb;
$$;

create function pg_temp.home() returns jsonb language sql as $$
  select '[
    {"exerciseId": "Bodyweight_Walking_Lunge", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 10, "max": 12}}},
    {"exerciseId": "Plank", "sets": 2, "restSeconds": 45, "target": {"seconds": 60}}
  ]'::jsonb;
$$;

-- The caller's workout as saved_workout() reads it, which clients may not call.
create function pg_temp.saved(workout_id bigint) returns jsonb language sql security definer as $$
  select public.saved_workout(workout_id);
$$;

-- The workout's alternatives as the app reads them.
create function pg_temp.alternatives(workout_id bigint) returns table (
  "position" smallint, name text, in_use boolean, exercises jsonb
) language sql as $$
  select a.position, a.name, a.in_use, a.exercises from public.workout_alternatives a
  where a.workout_id = alternatives.workout_id order by a.position;
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
-- Adding

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date) $$,
  '42501', null,
  'Anon cannot add an alternative'
);
select throws_ok(
  $$ select * from public.workout_alternatives $$,
  '42501', null,
  'nor read any'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date) $$,
  'BB006', null,
  'A user cannot add an alternative to another user''s workout'
);
select is_empty(
  $$ select * from public.workout_alternatives where workout_id = 911 $$,
  'nor read its alternatives'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is_empty(
  $$ select * from public.workout_alternatives $$,
  'A user reads only their own alternatives'
);
select is_empty(
  $$ select * from pg_temp.alternatives(911) $$,
  'A workout has no alternatives at first'
);

insert into ids select 'copy', public.add_workout_alternative(911, current_date, 'Copy');
select results_eq(
  $$ select * from pg_temp.alternatives(911) $$,
  $$ values (1::smallint, null::text, true, null::jsonb), (2::smallint, 'Copy', false, pg_temp.gym()) $$,
  'The first alternative added keeps the workout''s exercises as the one in use, and copies them'
);

insert into ids select 'home', public.add_workout_alternative(
  911,
  current_date,
  '  Home  ',
  -- As the editor sends it: a reps target with nulls, and a slot, which a workout made by hand drops.
  '[
    {"exerciseId": "Bodyweight_Walking_Lunge", "sets": 3, "restSeconds": 60, "slot": "squat", "target": {"reps": {"min": 10, "max": 12}, "seconds": null}},
    {"exerciseId": "Plank", "sets": 2, "restSeconds": 45, "target": {"seconds": 60, "meters": null}}
  ]'
);
select results_eq(
  $$ select position, name, exercises from public.workout_alternatives where id = pg_temp.id('home') $$,
  $$ values (3::smallint, 'Home', pg_temp.home()) $$,
  'An alternative added with exercises keeps them as the workout reads them, named without spaces around'
);
select is(
  pg_temp.saved(911) -> 'exercises',
  pg_temp.gym(),
  'and leaves the workout as it is'
);
select is((select count(*)::integer from public.planned_days), 0,
  'Trying the exercises keeps no days');

select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, '[]') $$,
  'BB008', null,
  'An alternative needs exercises'
);
select throws_ok(
  $$ select public.add_workout_alternative(
    911, current_date, null,
    '[{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 8, "max": 8}}}]'
  ) $$,
  'BB007', null,
  'whose targets suit them'
);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, null, '{}') $$,
  '22023', null,
  'as a list'
);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date, 'Thirteen char') $$,
  '23514', null,
  'A name is up to 12 characters'
);
select is((select count(*)::integer from pg_temp.alternatives(911)), 3,
  'A refused alternative adds nothing');

insert into ids select 'fourth', public.add_workout_alternative(911, current_date);
insert into ids select 'fifth', public.add_workout_alternative(911, current_date, '');
select results_eq(
  $$ select position, name from public.workout_alternatives where id in (pg_temp.id('fourth'), pg_temp.id('fifth')) order by position $$,
  $$ values (4::smallint, null::text), (5::smallint, null::text) $$,
  'An alternative may have no name'
);
select throws_ok(
  $$ select public.add_workout_alternative(911, current_date) $$,
  'BB041', null,
  'A workout has at most 5 alternatives'
);
select results_eq(
  $$ select * from public.workout_limits() $$,
  $$ values (20, 3, 5, 12) $$,
  'which the limits say'
);

select throws_ok(
  $$ insert into public.workout_alternatives (workout_id, user_id, position)
     values (911, '00000000-0000-0000-0000-00000000000a', 1) $$,
  '42501', null,
  'Users write alternatives only through the functions'
);

-- ----------------------------------------------------------------------------------------------
-- Renaming

select public.rename_workout_alternative(pg_temp.id('copy'), ' Gym 2 ');
select is((select name from public.workout_alternatives where id = pg_temp.id('copy')), 'Gym 2',
  'An alternative is renamed');
select public.rename_workout_alternative(pg_temp.id('copy'), '  ');
select is((select name from public.workout_alternatives where id = pg_temp.id('copy')), null,
  'and a blank name leaves it unnamed');
select throws_ok(
  $$ select public.rename_workout_alternative(pg_temp.id('copy'), 'Far too long a name') $$,
  '23514', null,
  'A new name is up to 12 characters too'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.rename_workout_alternative(pg_temp.id('copy'), 'Mine') $$,
  'P0002', null,
  'A user cannot rename another user''s alternative'
);

-- ----------------------------------------------------------------------------------------------
-- Using

select throws_ok(
  $$ select public.use_workout_alternative(pg_temp.id('home'), current_date) $$,
  'P0002', null,
  'A user cannot put another user''s alternative in use'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.use_workout_alternative(-1, current_date) $$,
  'P0002', null,
  'nor one that does not exist'
);

select public.use_workout_alternative(pg_temp.id('home'), current_date);
select is(
  pg_temp.saved(911),
  jsonb_build_object('id', 911, 'name', 'Legs', 'weekdays', '[1,2,3,4,5,6,7]'::jsonb, 'exercises', pg_temp.home()),
  'An alternative put in use is the workout, with its name and days'
);
select results_eq(
  $$ select * from pg_temp.alternatives(911) where position in (1, 3) $$,
  $$ values (1::smallint, null::text, false, pg_temp.gym()), (3::smallint, 'Home', true, null::jsonb) $$,
  'and the one in use before keeps its exercises'
);
select results_eq(
  $$ select day - current_date, name from public.planned_days order by day $$,
  $$ values (-2, 'Legs'), (-1, 'Legs') $$,
  'The days before today keep the plan they had'
);
select lives_ok(
  $$ select public.use_workout_alternative(pg_temp.id('home'), current_date) $$,
  'Putting the one in use in use again changes nothing'
);
select is(pg_temp.saved(911) -> 'exercises', pg_temp.home(), 'its exercises stay');

select public.use_workout_alternative(
  (select id from public.workout_alternatives where workout_id = 911 and position = 1), current_date
);
select is(pg_temp.saved(911) -> 'exercises', pg_temp.gym(),
  'Switching back gives the workout''s exercises exactly as they were');
select is((select exercises from public.workout_alternatives where id = pg_temp.id('home')), pg_temp.home(),
  'and keeps the other''s exactly as they were');

select throws_ok(
  $$ select public.use_workout_alternative(pg_temp.id('home'), current_date + 5) $$,
  '22023', null,
  'An alternative is put in use on the device''s today only'
);

-- ----------------------------------------------------------------------------------------------
-- Reordering

select public.reorder_workout_alternatives(911, array[
  pg_temp.id('home'), pg_temp.id('fifth'), pg_temp.id('copy'), pg_temp.id('fourth'),
  (select id from public.workout_alternatives where workout_id = 911 and in_use)
]);
select results_eq(
  $$ select id from public.workout_alternatives where workout_id = 911 order by position $$,
  $$ select unnest(array[
    pg_temp.id('home'), pg_temp.id('fifth'), pg_temp.id('copy'), pg_temp.id('fourth'),
    (select id from public.workout_alternatives where workout_id = 911 and in_use)
  ]) $$,
  'Alternatives are put in the order given'
);
select throws_ok(
  $$ select public.reorder_workout_alternatives(911, array[pg_temp.id('home'), pg_temp.id('fifth'), pg_temp.id('copy'), pg_temp.id('fourth')]) $$,
  '22023', null,
  'An order names every alternative'
);
select throws_ok(
  $$ select public.reorder_workout_alternatives(911, array[pg_temp.id('home'), pg_temp.id('fifth'), pg_temp.id('copy'), pg_temp.id('fourth'), pg_temp.id('home')]) $$,
  '22023', null,
  'each once'
);
select throws_ok(
  $$ select public.reorder_workout_alternatives(911, array[pg_temp.id('home'), pg_temp.id('fifth'), pg_temp.id('copy'), pg_temp.id('fourth'), pg_temp.id('arms copy')]) $$,
  '22023', null,
  'and none of another workout'
);
select throws_ok(
  $$ select public.reorder_workout_alternatives(911, array[pg_temp.id('home'), pg_temp.id('fifth'), pg_temp.id('copy'), pg_temp.id('fourth'), null]) $$,
  '22023', null,
  'nor a missing one'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.reorder_workout_alternatives(911, array(select id from ids where name in ('home', 'fifth', 'copy', 'fourth'))) $$,
  'BB006', null,
  'A user cannot reorder another user''s alternatives'
);

-- ----------------------------------------------------------------------------------------------
-- Deleting

select throws_ok(
  $$ select public.delete_workout_alternative(pg_temp.id('home')) $$,
  'P0002', null,
  'A user cannot delete another user''s alternative'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.delete_workout_alternative((select id from public.workout_alternatives where workout_id = 911 and in_use)) $$,
  'BB042', null,
  'The alternative in use cannot be deleted'
);

select public.delete_workout_alternative(pg_temp.id('fifth'));
select public.delete_workout_alternative(pg_temp.id('copy'));
select results_eq(
  $$ select id, position from public.workout_alternatives where workout_id = 911 order by position $$,
  $$ values
    (pg_temp.id('home'), 1::smallint),
    (pg_temp.id('fourth'), 2::smallint),
    ((select id from public.workout_alternatives where workout_id = 911 and in_use), 3::smallint) $$,
  'Deleting an alternative closes the gap in the order'
);

select public.delete_workout_alternative(pg_temp.id('home'));
select public.delete_workout_alternative(pg_temp.id('fourth'));
select is_empty(
  $$ select * from pg_temp.alternatives(911) $$,
  'Deleting down to one leaves the workout without alternatives'
);
select is(pg_temp.saved(911) -> 'exercises', pg_temp.gym(), 'and as it is');

-- ----------------------------------------------------------------------------------------------
-- Custom exercises

create function pg_temp.thrust(metrics jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'name', 'Hip thrust', 'metrics', metrics, 'primaryMuscles', '["glutes"]'::jsonb
  );
$$;

create temporary table thrust on commit drop as
  select public.create_exercise(pg_temp.thrust('["weight", "reps"]')) as id;
grant select on thrust to authenticated;
insert into ids select 'thrust', public.add_workout_alternative(
  911,
  current_date,
  'Thrust',
  jsonb_build_array(jsonb_build_object(
    'exerciseId', (select id from thrust), 'sets', 3, 'restSeconds', 60,
    'target', '{"reps": {"min": 8, "max": 12}}'::jsonb
  ))
);
select throws_ok(
  $$ select public.edit_exercise((select id from thrust), pg_temp.thrust('["duration"]')) $$,
  'BB018', null,
  'What an exercise records cannot change while an alternative not in use has it'
);
select lives_ok(
  $$ select public.use_workout_alternative(pg_temp.id('thrust'), current_date) $$,
  'so that the alternative can still be put in use'
);

-- C's exercise is made without the functions, so that C has not taken the user's lock yet.
reset role;
insert into public.exercises (
  id, owner_id, name, level, category, primary_muscles, secondary_muscles, instructions,
  image_paths, metrics
) values (
  'custom-step-up', '00000000-0000-0000-0000-00000000000c', 'Step up', 'beginner', 'strength',
  '{glutes}', '{}', '{}', '{}', '{weight,reps}'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select public.edit_exercise('custom-step-up', pg_temp.thrust('["weight", "reps"]'));
reset role;
select ok(
  exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.pid = pg_backend_pid()
      and ((l.classid::bigint << 32) | l.objid::bigint)
        = hashtextextended('limits:00000000-0000-0000-0000-00000000000c', 0)
  ),
  'Editing an exercise takes the user''s lock, as adding and using alternatives do'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.add_workout_alternative(
    911, current_date, null,
    '[{"exerciseId": "custom-step-up", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 8, "max": 12}}}]'
  ) $$,
  'BB015', null,
  'An alternative cannot have another user''s exercise'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select public.delete_workout(pg_temp.id('arms'), current_date);
reset role;
select is_empty(
  $$ select * from public.workout_alternatives where workout_id = (select id from ids where name = 'arms') $$,
  'Deleting a workout deletes its alternatives'
);

select * from finish();
rollback;
