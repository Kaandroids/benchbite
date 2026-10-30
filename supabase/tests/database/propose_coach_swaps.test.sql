-- Bite's swaps are built from the workout as it is, and only as the card shows them (ADR 0058).
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

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'workout', public.save_workout(
  '{"name": "Legs", "weekdays": [1], "exercises": [
    {"exerciseId": "Barbell_Squat", "sets": 4, "restSeconds": 120, "target": {"reps": {"min": 6, "max": 8}}},
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}
  ]}',
  current_date
);
reset role;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;

create function pg_temp.swap(swaps jsonb) returns bigint language sql as $$
  select public.propose_coach_swaps(
    (select id from ids where name = 'thread'), (select id from ids where name = 'workout'), swaps, current_date
  );
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into ids select 'swap', pg_temp.swap(
  '[{"replace": "Barbell_Squat", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 10, "max": 12}}}]'
);
reset role;
select is(
  (select change -> 'exercises' from public.coach_proposals where id = (select id from ids where name = 'swap')),
  '[
    {"exerciseId": "Leg_Press", "sets": 3, "restSeconds": 120, "target": {"reps": {"min": 10, "max": 12}}},
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}
  ]'::jsonb,
  'A swap changes its exercise, sets and target, and keeps the rest of the workout as it is'
);
select is(
  (select change ->> 'name' from public.coach_proposals where id = (select id from ids where name = 'swap')),
  'Legs',
  'and the workout''s name'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select pg_temp.swap('[{"replace": "Deadlift", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 8, "max": 8}}}]') $$,
  'BB039', null,
  'An exercise not in the workout is not swapped'
);
select throws_ok(
  $$ select pg_temp.swap('[
    {"replace": "Barbell_Squat", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 8, "max": 8}}},
    {"replace": "Leg_Press", "with": "Lunges", "sets": 3, "target": {"reps": {"min": 8, "max": 8}}}
  ]') $$,
  'BB039', null,
  'nor one only an earlier swap put in'
);
select throws_ok(
  $$ select pg_temp.swap('[
    {"replace": "Barbell_Squat", "with": "Plank", "sets": 3, "target": {"seconds": 30}},
    {"replace": "Plank", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 8, "max": 8}}}
  ]') $$,
  'BB040', null,
  'and swaps into one another are refused, as the card could not show them'
);
select throws_ok(
  $$ select pg_temp.swap('[{"replace": "Plank", "with": "Leg_Press", "sets": 3, "target": {"seconds": 30}}]') $$,
  'BB007', null,
  'A swap is tried as a proposal is, with save_workout()''s checks'
);

select throws_ok(
  $$ select pg_temp.swap(null) $$, '22023', null,
  'Swaps that are not a list propose nothing'
);
-- A workout with planks twice, which one swap would change both of.
insert into ids select 'twice', public.save_workout(
  '{"name": "Core", "weekdays": [2], "exercises": [
    {"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}},
    {"exerciseId": "Barbell_Squat", "sets": 3, "restSeconds": 60, "target": {"reps": {"min": 8, "max": 8}}},
    {"exerciseId": "Plank", "sets": 2, "restSeconds": 60, "target": {"seconds": 30}}
  ]}',
  current_date
);
select throws_ok(
  format(
    $$ select public.propose_coach_swaps(%s, %s, '[{"replace": "Plank", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 8, "max": 8}}}]', current_date) $$,
    (select id from ids where name = 'thread'), (select id from ids where name = 'twice')
  ),
  'BB040', null,
  'An exercise twice in the workout is not swapped by one swap'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select pg_temp.swap('[{"replace": "Barbell_Squat", "with": "Leg_Press", "sets": 3, "target": {"reps": {"min": 8, "max": 8}}}]') $$,
  'BB006', null,
  'Users swap only in their own workouts'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.propose_coach_swaps(bigint, bigint, jsonb, date)', 'execute'),
  'Signed-out callers may not propose swaps'
);

select * from finish();
rollback;
