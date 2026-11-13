-- import_steps() keeps the day's steps read from Apple Health or Health Connect (#469, ADR 0103): one
-- total a day of the last year, the higher count winning; only the caller's rows, read by them alone.
begin;
create extension if not exists pgtap with schema extensions;
-- Its helpers in pg_temp are called as the signed-in user, while new functions are closed to
-- PUBLIC by default (#529): opened again for this test, which is rolled back.
alter default privileges for role postgres grant execute on functions to public;

select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.steps(rows jsonb) returns integer language sql as $$
  select public.import_steps(rows, current_date);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select is(
  pg_temp.steps(jsonb_build_array(
    jsonb_build_object('day', current_date, 'steps', 6248.4),
    jsonb_build_object('day', current_date - 1, 'steps', 11340),
    jsonb_build_object('day', current_date - 2, 'steps', 0)
  )),
  3,
  'Three new days are kept'
);
select results_eq(
  $$ select day, steps from public.step_days order by day desc $$,
  $$ values (current_date, 6248), (current_date - 1, 11340), (current_date - 2, 0) $$,
  'Rounded, and a day without steps is kept as none'
);
select is(
  pg_temp.steps(jsonb_build_array(
    jsonb_build_object('day', current_date, 'steps', 6248),
    jsonb_build_object('day', current_date - 1, 'steps', 11340)
  )),
  0,
  'The same counts again change nothing'
);
select is(
  pg_temp.steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 7012))),
  1,
  'A day counted again takes the new total'
);
select is(
  pg_temp.steps(jsonb_build_array(jsonb_build_object('day', current_date - 1, 'steps', 2000))),
  0,
  'A lower total, as from a second phone, changes nothing'
);
select is(
  (select steps from public.step_days where day = current_date - 1),
  11340,
  'And the higher total stays'
);
select is(
  pg_temp.steps(jsonb_build_array(
    jsonb_build_object('day', current_date - 3, 'steps', 250000),
    jsonb_build_object('day', current_date - 4, 'steps', -5),
    jsonb_build_object('day', current_date - 5, 'steps', 'many'),
    jsonb_build_object('day', current_date + 2, 'steps', 5000),
    jsonb_build_object('day', '2026-13-01', 'steps', 5000),
    jsonb_build_object('day', (current_date - 6)::text || 'T23:30:00+14', 'steps', 5000),
    jsonb_build_object('day', current_date - 366, 'steps', 5000),
    jsonb_build_object('day', current_date - 365, 'steps', 4200)
  )),
  1,
  'Counts no one walks, days out of the last year and entries that are no day or count are left out alone'
);
select is(
  pg_temp.steps(jsonb_build_array(
    jsonb_build_object('day', current_date - 7, 'steps', 300000),
    jsonb_build_object('day', current_date - 7, 'steps', 8000),
    jsonb_build_object('day', current_date - 8, 'steps', 9100),
    jsonb_build_object('day', current_date - 8, 'steps', 9000)
  )),
  2,
  'Of a day given twice, one valid total is kept'
);
select results_eq(
  $$ select steps from public.step_days where day in (current_date - 7, current_date - 8) order by day desc $$,
  $$ values (8000), (9100) $$,
  'An out-of-range entry loses to a valid one, and the higher of two valid ones wins, sent first or last'
);
select is(
  pg_temp.steps(jsonb_build_array(
    jsonb_build_object('day', current_date - 10, 'steps', 4000),
    jsonb_build_object('day', current_date - 10, 'steps', 4500)
  )),
  1,
  'The higher total wins when sent last too'
);
select is(
  pg_temp.steps(jsonb_build_array(
    jsonb_build_object('day', current_date - 9, 'steps', 5000,
      'user_id', '00000000-0000-0000-0000-00000000000b')
  )),
  1,
  'A user id in the list is ignored'
);
select throws_ok(
  $$ insert into public.step_days (user_id, day, steps)
     values ('00000000-0000-0000-0000-00000000000a', current_date - 20, 100) $$,
  '42501', null,
  'Users cannot add steps directly'
);
select throws_ok(
  $$ update public.step_days set steps = 1 where day = current_date $$,
  '42501', null,
  'Users cannot change steps directly'
);
select throws_ok(
  $$ select public.import_steps(null, current_date) $$,
  '22023', 'Steps are a list of at most 366',
  'No list is refused'
);
select throws_ok(
  $$ select public.import_steps(
       (select jsonb_agg(jsonb_build_object('day', current_date, 'steps', 1)) from generate_series(1, 367)),
       current_date) $$,
  '22023', 'Steps are a list of at most 366',
  'At most 366 a call'
);
select throws_ok(
  $$ select public.import_steps('[]', current_date - 5) $$,
  '22023', null,
  'Today is the device''s today'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select count(*)::int from public.step_days),
  0,
  'Another user reads none of them'
);
select is(
  pg_temp.steps(jsonb_build_array(jsonb_build_object('day', current_date, 'steps', 3000))),
  1,
  'And keeps their own beside them'
);

reset role;
select set_config('request.jwt.claims', null, true);
set local role anon;
select throws_ok(
  $$ select public.import_steps('[]', current_date) $$,
  '42501', null,
  'Anonymous visitors cannot import steps'
);
select throws_ok(
  $$ select count(*) from public.step_days $$,
  '42501', null,
  'Nor read any'
);

select * from finish();
rollback;
