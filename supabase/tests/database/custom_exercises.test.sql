-- Users create, edit and archive their own exercises, which only they see and can use in their
-- workouts and logs; the library stays read-only.
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

create function pg_temp.hip_thrust(more jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'name', '  Hip thrust machine ',
    'metrics', jsonb_build_array('weight', 'reps'),
    'primaryMuscles', jsonb_build_array('glutes'),
    'secondaryMuscles', jsonb_build_array('hamstrings', 'glutes'),
    'equipment', 'machine',
    'level', 'intermediate',
    'instructions', jsonb_build_array('Sit with your back on the pad.', ' ', 'Drive up.')
  ) || more;
$$;

select results_eq(
  $$ select public, allowed_mime_types from storage.buckets where id = 'exercise-photos' $$,
  $$ values (false, '{image/jpeg}'::text[]) $$,
  'Exercise photos are private JPEGs'
);

-- A's exercise, its id kept for the tests below.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
create temp table made as select public.create_exercise(pg_temp.hip_thrust()) as id;
grant select on made to authenticated;

select results_eq(
  $$ select x.name, x.metrics, x.primary_muscles, x.secondary_muscles, x.equipment, x.level,
       x.category, x.instructions, x.owner_id
     from public.exercises x join made on made.id = x.id $$,
  $$ values ('Hip thrust machine', '{weight,reps}'::public.exercise_metric[],
       '{glutes}'::public.muscle[], '{hamstrings}'::public.muscle[], 'machine'::public.equipment,
       'intermediate'::public.exercise_level, 'strength'::public.exercise_category,
       '{"Sit with your back on the pad.","Drive up."}'::text[],
       '00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'An exercise is created with its fields tidied: a trimmed name, no repeated muscle, no empty step'
);
select ok((select id like 'custom-%' from made), 'A custom exercise has an id of its own');

select throws_ok(
  $$ select public.create_exercise(pg_temp.hip_thrust('{"metrics": ["weight"]}')) $$,
  'BB014', null, 'An exercise records weight and reps, reps, a time, or a distance and a time'
);
select throws_ok(
  $$ select public.create_exercise(pg_temp.hip_thrust('{"name": "  "}')) $$,
  'BB014', null, 'An exercise needs a name'
);
select throws_ok(
  $$ select public.create_exercise(pg_temp.hip_thrust('{"primaryMuscles": []}')) $$,
  'BB014', null, 'An exercise needs a main muscle'
);
select throws_ok(
  $$ select public.create_exercise(pg_temp.hip_thrust('{"primaryMuscles": ["wings"]}')) $$,
  'BB014', null, 'Muscles come from the list'
);
create temp table plain as select public.create_exercise(pg_temp.hip_thrust() - 'level' - 'equipment') as id;
select is(
  (select level from public.exercises x join plain on plain.id = x.id),
  'beginner'::public.exercise_level,
  'The level is beginner unless chosen'
);

create temp table photographed as select public.create_exercise(pg_temp.hip_thrust(jsonb_build_object(
  'imagePaths', jsonb_build_array(
    '00000000-0000-0000-0000-00000000000a/11111111-1111-1111-1111-111111111111.jpg')))) as id;
select is(
  (select image_paths from public.exercises x join photographed p on p.id = x.id),
  '{00000000-0000-0000-0000-00000000000a/11111111-1111-1111-1111-111111111111.jpg}'::text[],
  'An exercise keeps up to two photos'
);
select throws_ok(
  $$ select public.create_exercise(pg_temp.hip_thrust(jsonb_build_object('imagePaths',
       jsonb_build_array('00000000-0000-0000-0000-00000000000b/11111111-1111-1111-1111-111111111111.jpg')))) $$,
  'BB014', null, 'Photos come from the caller''s own folder'
);
create temp table end_only as select public.create_exercise(pg_temp.hip_thrust(jsonb_build_object(
  'imagePaths', jsonb_build_array(
    null, '00000000-0000-0000-0000-00000000000a/22222222-2222-2222-2222-222222222222.jpg')))) as id;
select is(
  (select image_paths from public.exercises x join end_only e on e.id = x.id),
  '{NULL,00000000-0000-0000-0000-00000000000a/22222222-2222-2222-2222-222222222222.jpg}'::text[],
  'A photo of the end alone stays second'
);
select throws_ok(
  $$ select public.create_exercise(pg_temp.hip_thrust('{"imagePaths": [null]}')) $$,
  'BB014', null, 'A missing photo stands only before the photo of the end'
);

select throws_ok(
  $$ update public.exercises set name = 'Mine' where id = 'Plank' returning id $$,
  '42501', null, 'The library cannot be changed'
);

-- B sees the library but not A's exercises, and cannot change or use them.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ select 1 from public.exercises x join made on made.id = x.id $$,
  'Other users do not see a custom exercise'
);
select isnt_empty($$ select 1 from public.exercises where id = 'Plank' $$, 'The library is for everyone');
select throws_ok(
  $$ select public.edit_exercise((select id from made), pg_temp.hip_thrust()) $$,
  'BB015', null, 'Other users cannot edit a custom exercise'
);
select throws_ok(
  $$ select public.save_workout(jsonb_build_object('name', 'Glutes', 'weekdays', '[]'::jsonb,
       'exercises', jsonb_build_array(jsonb_build_object('exerciseId', (select id from made),
         'sets', 3, 'target', '{"reps": {"min": 8, "max": 12}}'::jsonb, 'restSeconds', 60)))) $$,
  'BB015', null, 'Other users cannot put a custom exercise in their workouts'
);

-- A edits and archives it; once a workout has it, what it records stays.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.edit_exercise((select id from made),
       pg_temp.hip_thrust('{"name": "Hip thrust", "metrics": ["reps"]}')) $$,
  'Its owner edits a custom exercise, also what it records before it is logged'
);
select public.edit_exercise((select id from made), pg_temp.hip_thrust());
create temp table glutes as select public.save_workout(jsonb_build_object(
  'name', 'Glutes', 'weekdays', '[]'::jsonb,
  'exercises', jsonb_build_array(jsonb_build_object('exerciseId', (select id from made),
    'sets', 3, 'target', '{"reps": {"min": 8, "max": 12}}'::jsonb, 'restSeconds', 60))
)) as id;
grant select on glutes to authenticated;
select throws_ok(
  $$ select public.edit_exercise((select id from made), pg_temp.hip_thrust('{"metrics": ["duration"]}')) $$,
  'BB018', null, 'What an exercise records cannot change while a workout has it'
);
select public.log_workout(jsonb_build_object(
  'workoutId', (select id from glutes), 'startedAt', now() - interval '1 hour', 'finishedAt', now(),
  'exercises', jsonb_build_array(jsonb_build_object('exerciseId', (select id from made),
    'sets', jsonb_build_array(jsonb_build_object('weightKg', 60, 'reps', 10))))
));
select throws_ok(
  $$ select public.edit_exercise((select id from made), pg_temp.hip_thrust('{"metrics": ["duration"]}')) $$,
  'BB016', null, 'What an exercise records cannot change once it is logged'
);
select lives_ok(
  $$ select public.archive_exercise((select id from made), true) $$,
  'Its owner archives a custom exercise'
);
select results_eq(
  $$ select x.archived_at is not null, (select count(*) from public.logged_sets s where s.exercise_id = x.id)
     from public.exercises x join made on made.id = x.id $$,
  $$ values (true, 1::bigint) $$,
  'An archived exercise keeps its logged sets'
);
select throws_ok(
  $$ select public.archive_exercise('Plank', true) $$,
  'BB015', null, 'Library exercises cannot be archived'
);

select * from finish();
rollback;
