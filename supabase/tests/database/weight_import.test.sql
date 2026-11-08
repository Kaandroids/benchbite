-- import_weights() keeps the weights read from Apple Health or Health Connect (#22, ADR 0100): one a
-- day with its source, never over a weight entered in Benchbite, within the last 60 days and the
-- weights a person can have; log_weight() makes a day the user's own again.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.day(days_ago int) returns date language sql as $$
  select current_date - days_ago;
$$;

create function pg_temp.weights(rows jsonb) returns integer language sql as $$
  select public.import_weights(rows, current_date);
$$;

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
select is(
  (select source from public.weight_entries
   where user_id = '00000000-0000-0000-0000-00000000000a' and measured_on = pg_temp.day(5)),
  'Health',
  'A weight without a source still counts as the store''s'
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

select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select public.import_weights('[]', current_date) $$,
  '42501', 'Not signed in',
  'A session without a user is refused'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.import_weights(jsonb, date)', 'execute'),
  'Without a session nobody can call it'
);

select * from finish();
rollback;
