-- The plan switcher of the developer tools (ADR 0080): refused unless the Vault turns the tools
-- on, and with them, the caller's plan only, free, trial or premium, with its limits applied.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A has four workouts, one more than the free plan allows; B is on premium.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000b', 'premium', now() - interval '1 day', now() + interval '1 year', 'yearly', 'manual');
set local session_replication_role = replica;
insert into public.workouts (id, user_id, name, estimated_minutes, weekdays)
overriding system value values
  (101, '00000000-0000-0000-0000-00000000000a', 'One', 30, '{}'),
  (102, '00000000-0000-0000-0000-00000000000a', 'Two', 30, '{}'),
  (103, '00000000-0000-0000-0000-00000000000a', 'Three', 30, '{}'),
  (104, '00000000-0000-0000-0000-00000000000a', 'Four', 30, '{}');
set local session_replication_role = origin;

select ok(
  not has_function_privilege('anon', 'public.dev_set_plan(public.plan)', 'execute'),
  'A guest without a session cannot call it'
);
select ok(
  has_function_privilege('authenticated', 'public.dev_set_plan(public.plan)', 'execute'),
  'A signed-in user can'
);

-- Off without the Vault flag, as in production.
delete from vault.secrets where name = 'dev_tools';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.dev_set_plan('premium') $$,
  'BB053', null,
  'It is refused without the dev_tools flag in Vault'
);
reset role;
select vault.create_secret('off', 'dev_tools');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.dev_set_plan('premium') $$,
  'BB053', null,
  'and with any value but on'
);
reset role;
select is(
  (select count(*)::integer from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'and gives nothing'
);

-- On.
select vault.update_secret(id, 'on') from vault.secrets where name = 'dev_tools';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.dev_set_plan('premium');
reset role;
select results_eq(
  $$ select plan::text, period_start = now(), period_end = now() + interval '1 month', billing::text, source::text
     from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values ('premium', true, true, 'monthly', 'manual') $$,
  'Premium is a month given by hand, from now'
);
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'premium', 'and puts the caller on it');
select is(
  (select count(*)::integer from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a' and held),
  0,
  'under which every workout fits'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.dev_set_plan('free');
reset role;
select is(
  (select count(*)::integer from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'Free is no subscription'
);
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'free', 'and the free plan');
select is(
  (select count(*)::integer from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a' and held),
  1,
  'whose limits apply at once: the workout above them waits for premium'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.dev_set_plan('trial');
reset role;
select results_eq(
  $$ select plan::text, period_start = now(), period_end = now() + interval '7 days'
     from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values ('trial', true, true) $$,
  'The trial is its seven days, from now'
);
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'trial', 'and puts the caller on it');
select is(
  (select count(*)::integer from public.workouts where user_id = '00000000-0000-0000-0000-00000000000a' and held),
  0,
  'and what waited comes back with it'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select public.dev_set_plan('premium');
reset role;
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'premium', 'The trial switches to premium too');

-- Only the caller's own.
select results_eq(
  $$ select plan::text, period_end > now() + interval '11 months' from public.subscriptions
     where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  $$ values ('premium', true) $$,
  'Another user''s subscription is left as it was'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.dev_set_plan('premium') $$,
  '42501', null,
  'A guest has no plan to switch'
);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.dev_set_plan('premium') $$,
  '42501', null,
  'and nor has a call without a user'
);

select * from finish();
rollback;
