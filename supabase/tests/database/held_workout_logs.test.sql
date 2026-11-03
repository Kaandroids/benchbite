-- A session of a workout that waits for premium (#420, ADR 0079): `held_at` follows `held`, a
-- session started before the workout began to wait, or within five minutes after, is saved, one
-- started later is refused, and one is saved again once premium brings the workout back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A two-minute session of workout 101 that started at `started`.
create function pg_temp.log(started timestamptz) returns jsonb language sql as $$
  select jsonb_build_object(
    'workoutId', 101,
    'startedAt', started,
    'finishedAt', started + interval '2 minutes',
    'startedOn', (started at time zone 'UTC')::date,
    'exercises', jsonb_build_array(
      jsonb_build_object('exerciseId', 'Plank', 'sets', jsonb_build_array(
        jsonb_build_object('seconds', 45))))
  );
$$;

-- A has four workouts on the free plan, which allows three.
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays, active)
overriding system value values
  (101, '00000000-0000-0000-0000-00000000000a', 'Core', 30, '{}', true),
  (102, '00000000-0000-0000-0000-00000000000a', 'Push', 30, '{}', true),
  (103, '00000000-0000-0000-0000-00000000000a', 'Pull', 30, '{}', true),
  (104, '00000000-0000-0000-0000-00000000000a', 'Legs', 30, '{}', true);
set local session_replication_role = origin;

select is(
  (select held_at from public.workouts where id = 101),
  null,
  'A workout that does not wait has no stamp'
);

select public.apply_plan_limits('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select id, held_at from public.workouts
     where user_id = '00000000-0000-0000-0000-00000000000a' and held order by id $$,
  $$ values (101::bigint, now()) $$,
  'Holding a workout stamps when it began to wait'
);

update public.workouts set held_at = now() - interval '1 day' where id = 101;
select is(
  (select held_at from public.workouts where id = 101),
  now(),
  'The stamp cannot be set to anything else'
);
update public.workouts set held_at = now() - interval '1 day' where id = 102;
select is(
  (select held_at from public.workouts where id = 102),
  null,
  'nor given to a workout that does not wait'
);

-- Workout 101 began to wait an hour ago, so that sessions after it can end by now.
set local session_replication_role = replica;
update public.workouts set held_at = now() - interval '1 hour' where id = 101;
set local session_replication_role = origin;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.log_workout(pg_temp.log(now() - interval '2 hours')) $$,
  'A session started before the workout began to wait is saved'
);
select lives_ok(
  $$ select public.log_workout(pg_temp.log(now() - interval '58 minutes')) $$,
  'and so is one started within five minutes after, for a phone clock ahead'
);
select throws_ok(
  $$ select public.log_workout(pg_temp.log(now() - interval '30 minutes')) $$,
  'BB051', null,
  'one started later is refused'
);
select is(
  (select count(*)::integer from public.workout_logs where user_id = '00000000-0000-0000-0000-00000000000a'),
  2,
  'and leaves no log'
);
select throws_ok(
  $$ update public.workouts set held_at = null where id = 101 $$,
  '42501', null,
  'Users cannot change the stamp themselves'
);

-- Premium brings the workout back.
reset role;
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '1 day', now() + interval '30 days', 'monthly', 'manual');
select results_eq(
  $$ select held, held_at from public.workouts where id = 101 $$,
  $$ values (false, null::timestamptz) $$,
  'A workout that comes back loses its stamp'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.log_workout(pg_temp.log(now() - interval '30 minutes')) $$,
  'and a session started after it came back is saved again'
);
select is(
  (select count(*)::integer from public.workout_logs where user_id = '00000000-0000-0000-0000-00000000000a'),
  3,
  'with its log'
);

select * from finish();
rollback;
