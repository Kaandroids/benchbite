-- The archive is premium's (#411, ADR 0082): on a plan without it, nothing is moved to it, what is
-- in it waits and can be seen and deleted, neither it nor its alternatives count toward the limits,
-- and it is back in the archive with premium.
begin;
create extension if not exists pgtap with schema extensions;
-- Its helpers in pg_temp are called as the signed-in user, while new functions are closed to
-- PUBLIC by default (#529): opened again for this test, which is rolled back.
alter default privileges for role postgres grant execute on functions to public;

select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A has three active workouts and two archived, one of them with alternatives; B one active.
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays, active)
overriding system value values
  (101, '00000000-0000-0000-0000-00000000000a', 'Push', 30, '{}', true),
  (102, '00000000-0000-0000-0000-00000000000a', 'Pull', 30, '{}', true),
  (103, '00000000-0000-0000-0000-00000000000a', 'Legs', 30, '{}', true),
  (104, '00000000-0000-0000-0000-00000000000a', 'Core', 30, '{}', false),
  (105, '00000000-0000-0000-0000-00000000000a', 'Old', 30, '{}', false),
  (201, '00000000-0000-0000-0000-00000000000b', 'Upper', 30, '{}', true);
insert into public.workout_alternatives (id, workout_id, user_id, position, exercises, last_used_at)
overriding system value values
  (1011, 101, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1012, 101, '00000000-0000-0000-0000-00000000000a', 2, '[]', now()),
  (1041, 104, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1042, 104, '00000000-0000-0000-0000-00000000000a', 2, '[]', now()),
  (1043, 104, '00000000-0000-0000-0000-00000000000a', 3, '[]', now()),
  (1044, 104, '00000000-0000-0000-0000-00000000000a', 4, '[]', now());
insert into public.workout_exercises (
  workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max, rest_seconds
)
select w.id, w.user_id, 0, 'Barbell_Squat', 3, 8, 10, 90 from public.workouts w where w.id in (101, 102, 103, 104, 105, 201);
set local session_replication_role = origin;

-- On premium, the archive works and counts.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '30 days', now() + interval '1 day', 'monthly', 'manual');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is((select l.archive from public.workout_limits() l), true, 'Premium has the archive');
select lives_ok(
  $$ select public.set_workout_active(105, true, current_date) $$,
  'Premium brings a workout back from it'
);
select lives_ok(
  $$ select public.set_workout_active(105, false, current_date) $$,
  'and moves one to it'
);

-- Premium ends.
reset role;
select is(public.counted_workouts('00000000-0000-0000-0000-00000000000a'), 5, 'and archived workouts count');
update public.subscriptions set period_end = now() - interval '2 hours'
where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select is((select l.archive from public.workout_limits() l), false, 'Free has no archive');
select is(
  (select l.workouts_counted from public.workout_limits() l),
  3,
  'and the limits count the active ones alone'
);
select results_eq(
  $$ select id, active from public.workouts where held order by id $$,
  $$ values (104::bigint, false), (105, false) $$,
  'What is in the archive waits and stays archived; the active ones that fit do not wait'
);
select is(
  (select count(*)::integer from public.workout_alternatives where held and workout_id <> 104),
  0,
  'An archived workout''s versions keep no other alternative waiting'
);
select is(
  (select l.alternatives_added from public.workout_limits() l),
  1,
  'and its alternatives do not count'
);
select throws_ok(
  $$ select public.set_workout_active(101, false, current_date) $$,
  'BB054', null,
  'Nothing is moved to the archive'
);
select throws_ok(
  $$ select public.set_workout_active(104, true, current_date) $$,
  'BB051', null,
  'nor brought back from it'
);
select throws_ok(
  $$ select public.save_workout('{"id": 104, "name": "Core", "exercises": [{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}]}', current_date) $$,
  'BB051', null,
  'nor edited'
);

-- Only active workouts count toward the limit: three leave no room.
select throws_ok(
  $$ select public.save_workout('{"name": "New", "exercises": [{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}]}', current_date) $$,
  'BB009', null,
  'Three active workouts leave no room'
);
select lives_ok(
  $$ select public.delete_workout(103, current_date) $$,
  'Deleting an active one makes room'
);
select lives_ok(
  $$ select public.save_workout('{"name": "New", "exercises": [{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}]}', current_date) $$,
  'though the archive holds two'
);
select lives_ok(
  $$ select public.delete_workout(105, current_date) $$,
  'A workout in the archive can be deleted'
);

-- Premium comes back: all as it was.
reset role;
update public.subscriptions set period_end = now() + interval '30 days'
where user_id = '00000000-0000-0000-0000-00000000000a';
select results_eq(
  $$ select id, active, held from public.workouts where id = 104 $$,
  $$ values (104::bigint, false, false) $$,
  'With premium it stops waiting, in the archive'
);
select is(
  (select count(*)::integer from public.workout_alternatives where held and user_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'and so do its alternatives'
);

select * from finish();
rollback;
