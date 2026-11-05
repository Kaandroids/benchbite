-- A user chooses once what stays when premium ends (#411, ADR 0083): the choice opens with the end
-- of premium when something waits, the chosen stay and the rest wait, it cannot be made again, and
-- only the end of premium opens it again.
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
create function pg_temp.open_for(user_id uuid) returns boolean language sql as $$
  select a.choice_open from public.applied_plans a where a.user_id = open_for.user_id;
$$;

-- A has four active workouts and one archived, with alternatives on two; B two active.
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays, active)
overriding system value values
  (101, '00000000-0000-0000-0000-00000000000a', 'Push', 30, '{}', true),
  (102, '00000000-0000-0000-0000-00000000000a', 'Pull', 30, '{}', true),
  (103, '00000000-0000-0000-0000-00000000000a', 'Legs', 30, '{}', true),
  (104, '00000000-0000-0000-0000-00000000000a', 'Core', 30, '{}', true),
  (105, '00000000-0000-0000-0000-00000000000a', 'Old', 30, '{}', false),
  (201, '00000000-0000-0000-0000-00000000000b', 'Upper', 30, '{}', true),
  (202, '00000000-0000-0000-0000-00000000000b', 'Lower', 30, '{}', true);
insert into public.workout_alternatives (id, workout_id, user_id, position, exercises, last_used_at)
overriding system value values
  (1011, 101, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1012, 101, '00000000-0000-0000-0000-00000000000a', 2, '[]', now()),
  (1041, 104, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1042, 104, '00000000-0000-0000-0000-00000000000a', 2, '[]', now() - interval '1 day');
insert into public.workout_exercises (
  workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max, rest_seconds
)
select w.id, w.user_id, 0, 'Barbell_Squat', 3, 8, 10, 90 from public.workouts w
where w.id in (101, 102, 103, 104, 105, 201, 202);
-- Trained in this order, so that Core is the one that waits at first.
insert into public.workout_logs (user_id, workout_id, name, started_at, finished_at, started_on)
select '00000000-0000-0000-0000-00000000000a', t.workout_id, 'Log', now() - t.ago - interval '1 hour', now() - t.ago, current_date - t.days
from (values (101, interval '1 day', 1), (102, interval '2 days', 2), (103, interval '3 days', 3)) t(workout_id, ago, days);
set local session_replication_role = origin;

insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source) values
  ('00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '30 days', now() + interval '1 day', 'monthly', 'manual'),
  ('00000000-0000-0000-0000-00000000000b', 'premium', now() - interval '30 days', now() + interval '1 day', 'monthly', 'manual');
select is(pg_temp.open_for('00000000-0000-0000-0000-00000000000a'), false, 'Premium has no choice to make');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.choose_what_stays('{101,102,103}', '{1012}') $$,
  'BB055', null,
  'and cannot make one'
);

-- Premium ends.
reset role;
update public.subscriptions set period_end = now() - interval '2 hours'
where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

select is(pg_temp.open_for('00000000-0000-0000-0000-00000000000a'), true, 'The choice opens when something waits');
select is(pg_temp.open_for('00000000-0000-0000-0000-00000000000b'), false, 'but not when all fits');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is((select l.choice_open from public.workout_limits() l), true, 'and the limits say so');
select results_eq(
  $$ select id from public.workouts where held and active order by id $$,
  $$ values (104::bigint) $$,
  'Until then the ones last trained stay'
);

select throws_ok(
  $$ select public.choose_what_stays('{101,102}', '{1012}') $$,
  'BB056', null,
  'Fewer workouts than the plan has room for do not fit'
);
select throws_ok(
  $$ select public.choose_what_stays('{101,102,103,104}', '{1012}') $$,
  'BB056', null,
  'nor more'
);
select throws_ok(
  $$ select public.choose_what_stays('{101,101,102}', '{1012}') $$,
  'BB056', null,
  'nor the same one twice'
);
select throws_ok(
  $$ select public.choose_what_stays('{101,102,105}', '{1012}') $$,
  'BB056', null,
  'nor an archived one'
);
select throws_ok(
  $$ select public.choose_what_stays('{101,102,201}', '{1012}') $$,
  'BB056', null,
  'nor another user''s'
);
select throws_ok(
  $$ select public.choose_what_stays('{101,102,104}', '{1012,1042}') $$,
  'BB056', null,
  'More alternatives than the plan allows do not fit'
);
select throws_ok(
  $$ select public.choose_what_stays('{102,103,104}', '{1012}') $$,
  'BB056', null,
  'nor one of a workout that does not stay'
);

select lives_ok(
  $$ select public.choose_what_stays('{102,103,104}', '{1042}') $$,
  'A choice that fits is made'
);
select results_eq(
  $$ select id, held from public.workouts where active order by id $$,
  $$ values (101::bigint, true), (102, false), (103, false), (104, false) $$,
  'The chosen stay and the rest wait'
);
select results_eq(
  $$ select id, held from public.workout_alternatives where exercises is not null order by id $$,
  $$ values (1012::bigint, true), (1042, false) $$,
  'and so do the alternatives'
);
select results_eq(
  $$ select active, held from public.workouts where id = 105 $$,
  $$ values (false, true) $$,
  'What is in the archive stays as it is'
);
select throws_ok(
  $$ select public.choose_what_stays('{101,102,103}', '{1012}') $$,
  'BB055', null,
  'It cannot be made again'
);

-- Applying the plan again trades nothing, and does not open it.
reset role;
select public.apply_plan_limits('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select id from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a' and active and held $$,
  $$ values (101::bigint) $$,
  'Applying the plan again keeps the choice'
);
select is(pg_temp.open_for('00000000-0000-0000-0000-00000000000a'), false, 'and leaves it closed');

-- Premium comes back and ends again.
update public.subscriptions set period_end = now() + interval '30 days'
where user_id = '00000000-0000-0000-0000-00000000000a';
update public.subscriptions set period_end = now() - interval '2 hours'
where user_id = '00000000-0000-0000-0000-00000000000a';
select is(pg_temp.open_for('00000000-0000-0000-0000-00000000000a'), true, 'The next end of premium opens it again');

-- All fitting again closes it.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.delete_workout(104, current_date);
reset role;
select is(pg_temp.open_for('00000000-0000-0000-0000-00000000000a'), false, 'All fitting again closes it');

select * from finish();
rollback;
