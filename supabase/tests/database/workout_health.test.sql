-- set_workout_health() keeps what a watch measured during a workout (#85, ADR 0098): only on the
-- caller's own logs, within sensible ranges, replacing what was kept before, and never for anon.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.workout_logs (id, user_id, name, started_at, finished_at)
  overriding system value values
  (700, '00000000-0000-0000-0000-00000000000a', 'Push', now() - interval '1 hour', now()),
  (701, '00000000-0000-0000-0000-00000000000b', 'Arms', now() - interval '1 hour', now());

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ select public.set_workout_health(700, 132::smallint, 168::smallint, 412::smallint, ' Apple Watch ') $$,
  'A user keeps what their watch measured'
);
select results_eq(
  $$ select heart_rate_avg, heart_rate_max, active_kcal, health_source
     from public.workout_log_summaries where id = 700 $$,
  $$ values (132::smallint, 168::smallint, 412::smallint, 'Apple Watch') $$,
  'The summary shows it, the source trimmed'
);

select public.set_workout_health(700, null, null, 380::smallint, 'Zepp');
select results_eq(
  $$ select heart_rate_avg, active_kcal, health_source from public.workout_logs where id = 700 $$,
  $$ values (null::smallint, 380::smallint, 'Zepp') $$,
  'A later read replaces what was kept, parts it lacks included'
);

select throws_ok(
  $$ select public.set_workout_health(701, 120::smallint, 150::smallint, 200::smallint, 'Zepp') $$,
  'P0002', 'Workout log not found',
  'Nobody keeps it on another user''s log'
);
select throws_ok(
  $$ select public.set_workout_health(999, 120::smallint, 150::smallint, 200::smallint, 'Zepp') $$,
  'P0002', 'Workout log not found',
  'Nor on one that is not there'
);
select throws_ok(
  $$ select public.set_workout_health(700, 300::smallint, 310::smallint, null, null) $$,
  '23514', null,
  'A heart rate beyond what a person has is refused'
);
select throws_ok(
  $$ select public.set_workout_health(700, 150::smallint, 140::smallint, null, null) $$,
  '23514', null,
  'An average above the highest is refused'
);
select throws_ok(
  $$ update public.workout_logs set active_kcal = 1 where id = 700 $$,
  '42501', null,
  'Users cannot change it directly'
);

reset role;
select results_eq(
  $$ select heart_rate_avg, active_kcal from public.workout_logs where id = 701 $$,
  $$ values (null::smallint, null::smallint) $$,
  'The other user''s log is untouched'
);
select ok(
  not has_function_privilege('anon', 'public.set_workout_health(bigint, smallint, smallint, smallint, text)', 'execute'),
  'Without a session nobody can call it'
);

select * from finish();
rollback;
