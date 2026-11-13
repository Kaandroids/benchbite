-- import_weights() keeps the weights read from Apple Health or Health Connect (#22, ADR 0100): one a
-- day with its source, never over a weight entered in Benchbite, within the last 60 days and the
-- weights a person can have; log_weight() makes a day the user's own again.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
-- Its helpers are called as the signed-in user, while new functions are closed to clients
-- (#529, ADR 0126): only they are opened, and go with the test's session.
grant execute on all functions in schema pg_temp to public;

create function pg_temp.day(days_ago int) returns date language sql as $$
  select current_date - days_ago;
$$;
grant execute on all functions in schema pg_temp to public;

create function pg_temp.weights(rows jsonb) returns integer language sql as $$
  select public.import_weights(rows, current_date);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.log_weight(85.0, pg_temp.day(1));

select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(0), 'weightKg', 84.43, 'source', ' Withings '),
    jsonb_build_object('day', pg_temp.day(1), 'weightKg', 84.9, 'source', 'Withings'),
    jsonb_build_object('day', pg_temp.day(2), 'weightKg', 85.2, 'source', 'Withings')
  )),
  2,
  'Two new days are kept'
);
select results_eq(
  $$ select measured_on, weight_kg, source from public.weight_entries
     where user_id = '00000000-0000-0000-0000-00000000000a' order by measured_on desc $$,
  $$ values (current_date, 84.4::numeric(4, 1), 'Withings'),
            (current_date - 1, 85.0::numeric(4, 1), null),
            (current_date - 2, 85.2::numeric(4, 1), 'Withings') $$,
  'Rounded, with their source; the day entered in Benchbite keeps its weight'
);

select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(0), 'weightKg', 84.43, 'source', 'Withings')
  )),
  0,
  'The same weight again changes nothing'
);
select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(0), 'weightKg', 84.1, 'source', 'Eufy')
  )),
  1,
  'A later read of a day replaces the store''s weight'
);

select public.log_weight(84.0, current_date);
select results_eq(
  $$ select weight_kg, source from public.weight_entries
     where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on = current_date $$,
  $$ values (84.0::numeric(4, 1), null::text) $$,
  'A weight entered in Benchbite makes the day the user''s own'
);
select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(0), 'weightKg', 83.0, 'source', 'Eufy')
  )),
  0,
  'And the store no longer changes it'
);

select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(3), 'weightKg', 450, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(90), 'weightKg', 80, 'source', 'Scale'),
    jsonb_build_object('day', current_date + 3, 'weightKg', 80, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(4), 'weightKg', 'heavy', 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(5), 'weightKg', 86, 'source', E'\n')
  )),
  1,
  'Weights no person has, days out of range and values that are no number are left out alone'
);
select results_eq(
  $$ select from_health, source from public.weight_entries
     where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on = current_date - 5 $$,
  $$ values (true, null::text) $$,
  'A weight without a source still counts as the store''s'
);

select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(6), 'weightKg', 0.5, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(6), 'weightKg', 80, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(7), 'weightKg', 81, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(7), 'weightKg', 82, 'source', 'Scale')
  )),
  2,
  'Of a day given twice, the last valid one counts'
);
select results_eq(
  $$ select weight_kg from public.weight_entries
     where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on in (current_date - 6, current_date - 7)
     order by measured_on desc $$,
  $$ values (80.0::numeric(4, 1)), (82.0::numeric(4, 1)) $$,
  'An out-of-range entry loses to a valid one, and the later of two valid ones wins'
);
select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', '2026-13-01', 'weightKg', 80, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(8), 'weightKg', 83, 'source', 7),
    jsonb_build_object('day', pg_temp.day(9), 'weightKg', 83, 'source', jsonb_build_object('a', 1))
  )),
  2,
  'A day that is no date is left out alone'
);
select is(
  (select count(*)::int from public.weight_entries
   where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on in (current_date - 8, current_date - 9)
     and from_health and source is null),
  2,
  'A source that is no string counts as none'
);
select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', 'today', 'weightKg', 70, 'source', 'Scale'),
    jsonb_build_object('day', (current_date - 11)::text || 'T23:30:00+14', 'weightKg', 70, 'source', 'Scale'),
    jsonb_build_object('day', pg_temp.day(59), 'weightKg', 79, 'source', repeat('a', 79) || '  b')
  )),
  1,
  'Only a day in the form YYYY-MM-DD counts, and day 59 is still in the window'
);
select is(
  (select source from public.weight_entries
   where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on = current_date - 59),
  repeat('a', 79),
  'A long source is cut to 80 and trimmed again'
);
select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(60), 'weightKg', 80, 'source', 'Scale')
  )),
  0,
  'The window is the last 60 days'
);
select is(
  pg_temp.weights(jsonb_build_array(
    jsonb_build_object('day', pg_temp.day(10), 'weightKg', 84, 'source', 'Scale',
      'user_id', '00000000-0000-0000-0000-00000000000b')
  )),
  1,
  'A user id in the list is ignored'
);
select throws_ok(
  $$ update public.weight_entries set weight_kg = 90 where measured_on = current_date - 2 $$,
  '42501', null,
  'Users cannot change a weight directly'
);
select throws_ok(
  $$ select public.log_weight(80, current_date - 5) $$,
  '22023', null,
  'log_weight() takes only the device''s today'
);
select lives_ok(
  $$ select public.log_weight(84.6, current_date, current_date - 2) $$,
  'A recent day the store filled can be corrected'
);
select results_eq(
  $$ select weight_kg, from_health, source from public.weight_entries
     where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on = current_date - 2 $$,
  $$ values (84.6::numeric(4, 1), false, null::text) $$,
  'And is the user''s own afterwards'
);
select throws_ok(
  $$ select public.log_weight(80, current_date, current_date - 1) $$,
  '22023', 'Only today, or a recent day the health store filled',
  'A past day the user entered is not changed this way'
);
select throws_ok(
  $$ select public.import_weights(null, current_date) $$,
  '22023', 'Weights are a list of at most 60',
  'No list is refused'
);

select throws_ok(
  $$ select public.import_weights(
       (select jsonb_agg(jsonb_build_object('day', current_date, 'weightKg', 80)) from generate_series(1, 61)),
       current_date) $$,
  '22023', 'Weights are a list of at most 60',
  'At most 60 a call'
);
select throws_ok(
  $$ select public.import_weights('[]', current_date - 5) $$,
  '22023', null,
  'Today is the device''s today'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select count(*)::int from public.weight_entries),
  0,
  'Another user sees none of it, and got none of it'
);

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.import_weights('[]', current_date) $$,
  '42501', 'Not signed in',
  'A session without a user is refused'
);
select throws_ok(
  $$ select public.log_weight(80, current_date) $$,
  '42501', 'Not signed in',
  'By log_weight() too'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.import_weights(jsonb, date)', 'execute'),
  'Without a session nobody can call it'
);

select * from finish();
rollback;
