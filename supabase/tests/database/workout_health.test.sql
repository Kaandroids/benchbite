-- set_workout_health() keeps what a watch measured during a workout (#85, ADR 0098): only on the
-- caller's own logs, rounded, each value out of range left out on its own, what was kept before
-- kept for values read as missing, and never for anon.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

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

select lives_ok(
  $$ select public.set_workout_health(700, 131.6, 168, 411.7, ' Apple Watch ') $$,
  'A user keeps what their watch measured'
);
select results_eq(
  $$ select * from pg_temp.kept(700) $$,
  $$ values (132::smallint, 168::smallint, 412, 'Apple Watch') $$,
  'Rounded, in the summary, the source trimmed'
);

select public.set_workout_health(700, active_kcal => 380, source => 'Zepp');
select results_eq(
  $$ select * from pg_temp.kept(700) $$,
  $$ values (132::smallint, 168::smallint, 380, 'Zepp') $$,
  'A later read replaces what it has, and keeps the rest'
);

select public.set_workout_health(700, source => 'Nothing');
select results_eq(
  $$ select * from pg_temp.kept(700) $$,
  $$ values (132::smallint, 168::smallint, 380, 'Zepp') $$,
  'A read that found nothing changes nothing, not even the source'
);

select public.set_workout_health(702, 140, 255, 0.4, 'Zepp');
select results_eq(
  $$ select * from pg_temp.kept(702) $$,
  $$ values (140::smallint, null::smallint, 0, 'Zepp') $$,
  'A spike no heart can reach is left out alone, and a light session keeps 0 kcal'
);

select public.set_workout_health(702, heart_rate_max => 139.6);
select results_eq(
  $$ select avg, max from pg_temp.kept(702) $$,
  $$ values (140::smallint, 140::smallint) $$,
  'An average above the highest, by rounding or an earlier part, is held to the highest'
);

select public.set_workout_health(702, heart_rate_avg => 10, heart_rate_max => 9000, active_kcal => -5);
select results_eq(
  $$ select * from pg_temp.kept(702) $$,
  $$ values (140::smallint, 140::smallint, 0, 'Zepp') $$,
  'Values out of range all left out keep what was there'
);

select public.set_workout_health(702, active_kcal => 120, source => repeat('x', 100));
select is(
  (select length(source) from pg_temp.kept(702)),
  80,
  'A long source is cut to fit'
);

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

reset role;
select results_eq(
  $$ select heart_rate_avg, active_kcal from public.workout_logs where id = 701 $$,
  $$ values (null::smallint, null::integer) $$,
  'The other user''s log is untouched'
);
select ok(
  not has_function_privilege('anon', 'public.set_workout_health(bigint, numeric, numeric, numeric, text)', 'execute'),
  'Without a session nobody can call it'
);
select throws_ok(
  $$ update public.workout_logs set heart_rate_avg = 150, heart_rate_max = 140 where id = 700 $$,
  '23514', null,
  'The table itself never keeps an average above the highest'
);

select * from finish();
rollback;
