-- my_consents() says which of the caller's consents hold now and when each was given, by the
-- server's rule (#652).
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.health_data_consents (user_id, policy_version, granted_at) values
  ('00000000-0000-0000-0000-00000000000a', '2026-10-21', '2026-10-21 10:00+00'),
  ('00000000-0000-0000-0000-00000000000b', '2026-10-21', '2026-10-22 10:00+00');
insert into public.ai_consents (user_id, consent_version, granted_at) values
  ('00000000-0000-0000-0000-00000000000a', '2026-11-18', '2026-11-18 10:00+00');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select health_given_at, ai_given_at from public.my_consents() $$,
  $$ values ('2026-10-21 10:00+00'::timestamptz, '2026-11-18 10:00+00'::timestamptz) $$,
  'Both consents hold, with when they were given'
);

reset role;
insert into public.ai_consent_withdrawals (user_id, withdrawn_at)
  values ('00000000-0000-0000-0000-00000000000a', '2026-11-19 10:00+00');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select health_given_at, ai_given_at from public.my_consents() $$,
  $$ values ('2026-10-21 10:00+00'::timestamptz, null::timestamptz) $$,
  'A withdrawn consent is not given'
);

reset role;
insert into public.health_data_consent_withdrawals (user_id, withdrawn_at)
  values ('00000000-0000-0000-0000-00000000000a', '2026-11-20 10:00+00');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select health_given_at, ai_given_at from public.my_consents() $$,
  $$ values (null::timestamptz, null::timestamptz) $$,
  'Neither holds once the health data consent is withdrawn'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select health_given_at, ai_given_at from public.my_consents() $$,
  $$ values ('2026-10-22 10:00+00'::timestamptz, null::timestamptz) $$,
  'Each user reads their own'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.my_consents()', 'execute'),
  'anon cannot read consents'
);

select * from finish();
rollback;
