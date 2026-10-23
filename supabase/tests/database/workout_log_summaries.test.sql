-- workout_log_summaries adds up each finished workout and estimates its calories from the user's
-- weight on that day; users only see their own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Written as the table owner: two logs of an hour, one with a weight that day and one without.
insert into public.weight_entries (user_id, weight_kg, measured_on) values
  ('00000000-0000-0000-0000-00000000000a', 80, '2026-10-01'),
  ('00000000-0000-0000-0000-00000000000a', 90, '2026-10-30');
insert into public.workout_logs (id, user_id, type, started_at, finished_at)
  overriding system value values
  (700, '00000000-0000-0000-0000-00000000000a', 'push', '2026-10-20 18:00+00', '2026-10-20 19:00+00'),
  (701, '00000000-0000-0000-0000-00000000000a', 'pull', '2026-09-20 18:00+00', '2026-09-20 18:30+00'),
  (702, '00000000-0000-0000-0000-00000000000b', 'legs', '2026-10-20 18:00+00', '2026-10-20 19:00+00');
insert into public.logged_sets (log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds)
values
  (700, '00000000-0000-0000-0000-00000000000a', 0, 0, 'Barbell_Bench_Press_-_Medium_Grip', 80, 8, null),
  (700, '00000000-0000-0000-0000-00000000000a', 0, 1, 'Barbell_Bench_Press_-_Medium_Grip', 80, 6, null),
  (700, '00000000-0000-0000-0000-00000000000a', 1, 0, 'Plank', null, null, 45),
  (701, '00000000-0000-0000-0000-00000000000a', 0, 0, 'Pushups', null, 15, null);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select id::integer, sets, kilograms, estimated_kcal from public.workout_log_summaries
     where id = 700 $$,
  $$ values (700, 3, 1120.0000::numeric, 400) $$,
  'A log adds up its sets and weight, and estimates calories from the weight on that day'
);
select results_eq(
  $$ select kilograms, estimated_kcal from public.workout_log_summaries where id = 701 $$,
  $$ values (0::numeric, null::integer) $$,
  'Without weights lifted or a weight that day, the sums are zero and there is no estimate'
);
select is(
  round(public.my_strength_kcal_per_minute() * 60),
  450::numeric,
  'Planned workouts are estimated from the latest weight'
);
select is(
  (select count(*)::integer from public.workout_log_summaries),
  2,
  'Users only see their own workouts'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select 1 from public.workout_log_summaries $$,
  '42501', null,
  'Anon cannot read summaries'
);

select * from finish();
rollback;
