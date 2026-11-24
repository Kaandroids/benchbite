-- The consent to read the phone's health store (#711, ADR 0166): given only on top of the health
-- data consent, ended by disconnecting and by withdrawing that consent, read only by its user, and
-- written only through its functions.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- A has the health data consent; B does not.
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false);
insert into public.health_data_consents (user_id, policy_version)
values ('00000000-0000-0000-0000-00000000000a', '2026-10-21');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(public.my_health_app_consent(), false, 'Nobody has the consent before giving it');
select lives_ok(
  $$ select public.give_health_app_consent('apple_health', '2026-11-23') $$,
  'A user with the health data consent gives it'
);
select is(public.my_health_app_consent(), true, 'It holds once given');
select results_eq(
  $$ select store, consent_version from public.health_app_consents $$,
  $$ values ('apple_health', '2026-11-23') $$,
  'It is recorded with its store and the version of its text'
);
select throws_ok(
  $$ select public.give_health_app_consent('fitbit', '2026-11-23') $$,
  '23514',
  null,
  'Only Apple Health and Health Connect are stores'
);
select throws_ok(
  $$ insert into public.health_app_consents (store, consent_version) values ('apple_health', 'x') $$,
  '42501',
  null,
  'Users cannot write a consent of their own'
);
select throws_ok(
  $$ insert into public.health_app_consent_withdrawals default values $$,
  '42501',
  null,
  'Users cannot write a withdrawal of their own'
);

select lives_ok($$ select public.withdraw_health_app_consent() $$, 'Disconnecting ends it');
select is(public.my_health_app_consent(), false, 'It no longer holds');
select is(
  (select count(*) from public.health_app_consent_withdrawals)::integer, 1,
  'The withdrawal is recorded'
);
select lives_ok($$ select public.withdraw_health_app_consent() $$, 'Disconnecting again is fine');
select is(
  (select count(*) from public.health_app_consent_withdrawals)::integer, 1,
  'and records nothing more'
);

-- Given again, a minute later, it ends with the health data consent it rests on. The test runs in
-- one transaction, whose now() does not move: the withdrawal is moved back instead.
reset role;
update public.health_app_consent_withdrawals set withdrawn_at = withdrawn_at - interval '1 minute';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.give_health_app_consent('apple_health', '2026-11-23');
select is(public.my_health_app_consent(), true, 'Given again, it holds again');
select public.withdraw_health_consent();
select is(public.my_health_app_consent(), false, 'Withdrawing the health data consent ends it');
select is(
  (select count(*) from public.health_app_consent_withdrawals)::integer, 2,
  'and records its end'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.give_health_app_consent('health_connect', '2026-11-23') $$,
  'BB067',
  null,
  'Without the health data consent it cannot be given'
);
select is_empty(
  $$ select * from public.health_app_consents $$,
  'A user does not see another user''s consents'
);
select is_empty(
  $$ select * from public.health_app_consent_withdrawals $$,
  'nor their withdrawals'
);

select * from finish();
rollback;
