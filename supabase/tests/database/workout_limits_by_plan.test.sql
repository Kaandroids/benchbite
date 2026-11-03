-- Workout limits by plan (#410, ADR 0079): the limits follow the plan, what is above it waits for
-- premium when premium ends, the ones last trained or used stay, what waits can be seen and
-- deleted but not used, it counts toward the limits, plans no day, and comes back with premium.
begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A has five workouts, the last one archived, trained on different days, and alternatives of three
-- of them; B two workouts without any.
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays, active)
overriding system value values
  (101, '00000000-0000-0000-0000-00000000000a', 'Push', 30, '{}', true),
  (102, '00000000-0000-0000-0000-00000000000a', 'Pull', 30, '{}', true),
  (103, '00000000-0000-0000-0000-00000000000a', 'Legs', 30, '{}', true),
  (104, '00000000-0000-0000-0000-00000000000a', 'Core', 30, '{1,2,3,4,5,6,7}', true),
  (105, '00000000-0000-0000-0000-00000000000a', 'Old', 30, '{}', false),
  (201, '00000000-0000-0000-0000-00000000000b', 'Upper', 30, '{}', true),
  (202, '00000000-0000-0000-0000-00000000000b', 'Lower', 30, '{}', true);
insert into public.workout_exercises (
  workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max, rest_seconds
)
select w.id, w.user_id, 0, 'Barbell_Squat', 3, 8, 10, 90 from public.workouts w where w.id in (101, 102, 103, 104, 105, 201, 202);
insert into public.workout_logs (user_id, workout_id, name, started_at, finished_at, started_on)
select '00000000-0000-0000-0000-00000000000a', t.workout_id, 'Log', now() - t.ago - interval '1 hour', now() - t.ago, current_date - t.days
from (values (101, interval '1 day', 1), (102, interval '3 days', 3), (103, interval '10 days', 10), (105, interval '2 days', 2)) t(workout_id, ago, days);
insert into public.workout_alternatives (id, workout_id, user_id, position, exercises, last_used_at)
overriding system value values
  (1011, 101, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1012, 101, '00000000-0000-0000-0000-00000000000a', 2, '[]', now() - interval '1 day'),
  (1013, 101, '00000000-0000-0000-0000-00000000000a', 3, '[]', now() - interval '5 days'),
  (1021, 102, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1022, 102, '00000000-0000-0000-0000-00000000000a', 2, '[]', now() - interval '2 hours'),
  (1041, 104, '00000000-0000-0000-0000-00000000000a', 1, null, null),
  (1042, 104, '00000000-0000-0000-0000-00000000000a', 2, '[]', now());
set local session_replication_role = origin;

-- A is on premium, under which everything fits.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '30 days', now() + interval '1 day', 'monthly', 'manual');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select * from public.workout_limits() $$,
  $$ values (20, 500, 5, 12, null::integer, 4) $$,
  'Premium has 500 workouts and 5 versions of each, with no limit on alternatives in all'
);
select is((select count(*)::integer from public.workouts where held), 0, 'Nothing waits while it fits');

-- Before premium ends, A moved Core from this week's Monday, already kept, to its Sunday.
reset role;
insert into public.planned_days_kept (user_id, through)
values ('00000000-0000-0000-0000-00000000000a', date_trunc('week', current_date)::date)
on conflict (user_id) do update set through = excluded.through;
insert into public.workout_moves (user_id, workout_id, from_on, to_on)
values (
  '00000000-0000-0000-0000-00000000000a', 104,
  date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6
);

-- Premium ends.
update public.subscriptions set period_end = now() - interval '2 hours'
where user_id = '00000000-0000-0000-0000-00000000000a';

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select * from public.workout_limits() $$,
  $$ values (20, 3, 2, 12, 1, 4) $$,
  'Free has 3 workouts and 1 alternative in all, with the ones the user has'
);
select results_eq(
  $$ select id from public.workouts where held order by id $$,
  $$ values (104::bigint), (105) $$,
  'The workouts last trained stay, active before archived; the rest wait'
);
select results_eq(
  $$ select id, active from public.workouts where id in (104, 105) order by id $$,
  $$ values (104::bigint, true), (105, false) $$,
  'and stay active or archived as they were'
);
select results_eq(
  $$ select id from public.workout_alternatives where held order by id $$,
  $$ values (1012::bigint), (1013), (1042) $$,
  'The alternative last in use stays, and a waiting workout''s wait'
);
reset role;
select is(
  (select plan::text from public.applied_plans where user_id = '00000000-0000-0000-0000-00000000000a'),
  'free',
  'The plan applied is remembered'
);
select is(
  (select count(*)::integer from public.subscriptions s left join public.applied_plans a using (user_id) where a.plan is distinct from public.plan_of(s.user_id)),
  0,
  'so the sweep has no user left to apply'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- What waits can be seen but not used.
select throws_ok(
  $$ select public.save_workout('{"id": 104, "name": "Core", "exercises": [{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}]}', current_date) $$,
  'BB051', null,
  'A waiting workout cannot be edited'
);
select throws_ok(
  $$ select public.set_workout_active(104, false, current_date) $$,
  'BB051', null,
  'nor archived'
);
select lives_ok(
  $$ select public.delete_workout_alternative(1042) $$,
  'but its alternatives can be deleted'
);
reset role;
select throws_ok(
  $$ insert into public.workout_alternatives (workout_id, user_id, position)
     values (104, '00000000-0000-0000-0000-00000000000a', 1) $$,
  'BB051', null,
  'and it is given no new one, however it is added'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.use_workout_alternative(1012, current_date) $$,
  'BB051', null,
  'A waiting alternative cannot be put in use'
);
select throws_ok(
  $$ select public.rename_workout_alternative(1012, 'Hotel') $$,
  'BB051', null,
  'nor renamed'
);
reset role;
select lives_ok(
  $$ insert into public.workout_logs (user_id, workout_id, name, started_at, finished_at, started_on)
     values ('00000000-0000-0000-0000-00000000000a', 104, 'Core', now() - interval '1 hour', now(), current_date) $$,
  'A workout done before it began to wait is still logged'
);
select is(
  (select count(*)::integer from public.plan_by_weekdays('00000000-0000-0000-0000-00000000000a', current_date, current_date + 6) p where p.workout_id = 104),
  0,
  'A waiting workout plans no day'
);
-- day_workouts() reads the caller's days and is for owner-rights functions only.
-- Nor is it moved, from a day kept before it began to wait.
update public.planned_days_kept set through = greatest(through, current_date - 1)
where user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.planned_days (user_id, day, workout_id, name)
values ('00000000-0000-0000-0000-00000000000a', current_date - 1, 104, 'Core');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.move_workout(104, current_date - 1, null) $$,
  'BB019', null,
  'A waiting workout is not moved or skipped'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
reset role;
select is(
  (select count(*)::integer from public.day_workouts(date_trunc('week', current_date)::date + 6, date_trunc('week', current_date)::date + 6, current_date) d where d.workout_id = 104),
  0,
  'not even the one it was moved to'
);

-- It counts toward the limits.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.save_workout('{"name": "New", "exercises": [{"exerciseId": "Plank", "sets": 3, "restSeconds": 60, "target": {"seconds": 45}}]}', current_date) $$,
  'BB009', null,
  'Waiting workouts count toward the limit'
);

-- It can be deleted.
select lives_ok(
  $$ select public.delete_workout_alternative(1013) $$,
  'A waiting alternative can be deleted'
);
select lives_ok(
  $$ select public.delete_workout(105, current_date) $$,
  'and a waiting workout'
);
select is((select count(*)::integer from public.workouts), 4, 'which is gone');

-- Applying again trades nothing: what is usable stays, and what waits waits.
reset role;
select public.apply_plan_limits('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select id from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a' and held order by id $$,
  $$ values (104::bigint) $$,
  'Applying the plan again changes nothing'
);

-- An alternative that stops being in use is stamped.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.use_workout_alternative(1022, current_date) $$,
  'A usable alternative is put in use'
);
select isnt(
  (select last_used_at from public.workout_alternatives where id = 1021),
  null,
  'and the one it replaces is stamped as last in use'
);

-- Premium again: everything comes back.
reset role;
update public.subscriptions set period_end = now() + interval '30 days'
where user_id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select count(*)::integer from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a' and held),
  0,
  'With premium again, every workout comes back'
);
select is(
  (select count(*)::integer from public.workout_alternatives where user_id = '00000000-0000-0000-0000-00000000000a' and held),
  0,
  'and every alternative'
);

-- B is free: one alternative in all.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select lives_ok(
  $$ select public.add_workout_alternative(201, current_date) $$,
  'A free user adds an alternative'
);
select throws_ok(
  $$ select public.add_workout_alternative(202, current_date) $$,
  'BB052', null,
  'but not a second, to another workout'
);
select throws_ok(
  $$ select public.add_workout_alternative(201, current_date) $$,
  'BB041', null,
  'nor a third version of the same one'
);

-- What fits again after a delete comes back, for a user without a subscription too.
reset role;
set local session_replication_role = replica;
insert into public.workout_alternatives (id, workout_id, user_id, position, exercises, last_used_at)
overriding system value values
  (2021, 202, '00000000-0000-0000-0000-00000000000b', 1, null, null),
  (2022, 202, '00000000-0000-0000-0000-00000000000b', 2, '[]', now() - interval '3 days');
set local session_replication_role = origin;
select public.apply_plan_limits('00000000-0000-0000-0000-00000000000b');
select is(
  (select held from public.workout_alternatives where workout_id = 201 and exercises is not null),
  true,
  'A free user''s alternative never in use waits, the one last in use stays'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select public.delete_workout_alternative(2022);
reset role;
select is(
  (select held from public.workout_alternatives where workout_id = 201 and exercises is not null),
  false,
  'and comes back once the other is deleted'
);

-- A waiting workout's alternative waits, even when the alternatives fit: C, free, has four
-- workouts never trained, and one alternative of the oldest.
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays)
overriding system value values
  (301, '00000000-0000-0000-0000-00000000000c', 'One', 30, '{}'),
  (302, '00000000-0000-0000-0000-00000000000c', 'Two', 30, '{}'),
  (303, '00000000-0000-0000-0000-00000000000c', 'Three', 30, '{}'),
  (304, '00000000-0000-0000-0000-00000000000c', 'Four', 30, '{}');
insert into public.workout_alternatives (id, workout_id, user_id, position, exercises)
overriding system value values
  (3011, 301, '00000000-0000-0000-0000-00000000000c', 1, null),
  (3012, 301, '00000000-0000-0000-0000-00000000000c', 2, '[]');
set local session_replication_role = origin;
select public.apply_plan_limits('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select (select held from public.workouts where id = 301), (select held from public.workout_alternatives where id = 3012) $$,
  $$ values (true, true) $$,
  'A waiting workout''s alternative waits with it, though the alternatives fit'
);

-- The sweep applies a plan whose end has passed without a change to its row: D had premium and
-- four workouts.
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays)
overriding system value values
  (401, '00000000-0000-0000-0000-00000000000d', 'One', 30, '{}'),
  (402, '00000000-0000-0000-0000-00000000000d', 'Two', 30, '{}'),
  (403, '00000000-0000-0000-0000-00000000000d', 'Three', 30, '{}'),
  (404, '00000000-0000-0000-0000-00000000000d', 'Four', 30, '{}');
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000d', 'premium', now() - interval '30 days', now() - interval '2 hours', 'monthly', 'manual');
insert into public.applied_plans (user_id, plan) values ('00000000-0000-0000-0000-00000000000d', 'premium');
set local session_replication_role = origin;
select public.apply_changed_plan_limits();
select results_eq(
  $$ select id from public.workouts where user_id = '00000000-0000-0000-0000-00000000000d' and held $$,
  $$ values (401::bigint) $$,
  'The sweep holds what is above a plan whose end has passed'
);

select is(
  (select command from cron.job where jobname = 'apply-plan-limits'),
  'select public.apply_changed_plan_limits()',
  'Plans that changed are applied every ten minutes'
);

select * from finish();
rollback;
