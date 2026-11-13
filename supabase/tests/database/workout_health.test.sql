-- set_workout_health() keeps what a watch measured during a workout (#85, ADR 0098, ADR 0099):
-- only on the caller's own logs, rounded, a whole read or nothing (a heart rate a person can have,
-- and calories only with it), keeping what a read did not find, saying whether it changed anything,
-- and never for anon.
begin;
create extension if not exists pgtap with schema extensions;
-- Its helpers in pg_temp are called as the signed-in user, while new functions are closed to
-- PUBLIC by default (#529): opened again for this test, which is rolled back.
alter default privileges for role postgres grant execute on functions to public;

select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

insert into public.workout_logs (id, user_id, name, started_at, finished_at)
  overriding system value values
  (700, '00000000-0000-0000-0000-00000000000a', 'Push', now() - interval '1 hour', now()),
  (701, '00000000-0000-0000-0000-00000000000b', 'Arms', now() - interval '1 hour', now()),
  (702, '00000000-0000-0000-0000-00000000000a', 'Legs', now() - interval '3 hours', now() - interval '2 hours');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.kept(log bigint) returns table (avg smallint, max smallint, kcal integer, source text)
language sql as $$
  select heart_rate_avg, heart_rate_max, active_kcal, health_source
  from public.workout_log_summaries where id = log;
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select ok(
  public.set_workout_health(700, 131.6, 168, 411.7, ' Apple Watch '),
  'A user keeps what their watch measured, and hears that it changed'
);
select results_eq(
  $$ select * from pg_temp.kept(700) $$,
  $$ values (132::smallint, 168::smallint, 412, 'Apple Watch') $$,
  'Rounded, in the summary, the source trimmed'
);
select ok(
  not public.set_workout_health(700, 131.6, 168, 411.7, 'Apple Watch'),
  'The same read again changes nothing'
);

select public.set_workout_health(700, 140, 175);
select results_eq(
  $$ select * from pg_temp.kept(700) $$,
  $$ values (140::smallint, 175::smallint, 412, 'Apple Watch') $$,
  'A later read replaces the heart rate, and keeps the calories and source it did not find'
);

select ok(
  not public.set_workout_health(700, active_kcal => 6, source => 'iPhone'),
  'Calories without a heart rate change nothing'
);
select ok(
  not public.set_workout_health(700, 140, 262, 500, 'Zepp'),
  'A spike leaves the whole read out'
);
select ok(
  not public.set_workout_health(700, 10, 150, 500, 'Zepp'),
  'So does an average no person has'
);
select ok(
  not public.set_workout_health(700, 1e10, 1e10, 1e10, 'Zepp'),
  'And values too large for any column'
);
select results_eq(
  $$ select * from pg_temp.kept(700) $$,
  $$ values (140::smallint, 175::smallint, 412, 'Apple Watch') $$,
  'None of those changed what was kept'
);

select public.set_workout_health(702, 151.4, 149.6, null, E'\n\t ');
select results_eq(
  $$ select * from pg_temp.kept(702) $$,
  $$ values (150::smallint, 150::smallint, null::integer, null::text) $$,
  'The average is held to the highest, and a source of only whitespace is none'
);
select public.set_workout_health(702, 120, 150, 90, repeat('x', 100));
select is((select length(source) from pg_temp.kept(702)), 80, 'A long source is cut to fit');

select throws_ok(
  $$ select public.set_workout_health(701, 120, 150, 200, 'Zepp') $$,
  'BB013', 'Workout log not found',
  'Nobody keeps it on another user''s log'
);
select throws_ok(
  $$ select public.set_workout_health(999, 120, 150, 200, 'Zepp') $$,
  'BB013', 'Workout log not found',
  'Nor on one that is not there'
);
select throws_ok(
  $$ update public.workout_logs set active_kcal = 1 where id = 700 $$,
  '42501', null,
  'Users cannot change it directly'
);

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.set_workout_health(700, 120, 150, 200, 'Zepp') $$,
  '42501', 'Not signed in',
  'A session without a user is refused'
);

reset role;
select results_eq(
  $$ select heart_rate_avg, active_kcal from public.workout_logs where id = 701 $$,
  $$ values (null::smallint, null::integer) $$,
  'The other user''s log is untouched'
);
select ok(
  not has_function_privilege('anon', 'public.set_workout_health(bigint, numeric, numeric, numeric, text, numeric[])', 'execute'),
  'Without a session nobody can call it'
);

select * from finish();
rollback;
