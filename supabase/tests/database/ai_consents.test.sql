-- The consent to the AI features (#290, ADR 0142): until it is given, ai_access() refuses a user
-- the plan lets in as consent_required, and no call starts; users give and read only their own,
-- and change none.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- A and B are premium, F free, G a guest; none has consented.
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000f', 'f@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true);
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values
  ('00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '1 day',
   now() + interval '29 days', 'monthly', 'manual'),
  ('00000000-0000-0000-0000-00000000000b', 'premium', now() - interval '1 day',
   now() + interval '29 days', 'monthly', 'manual');
-- B has used the period's budget.
insert into public.ai_usage
  (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
   thinking_tokens, cost_usd, created_at)
select gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'coach_chat', 'test',
  0, 0, 0, 0, (select budget_usd from public.plans where plan = 'premium'),
  now() - interval '1 hour';

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select row(allowed, reason)::text from public.ai_access('coach_chat')),
  row(false, 'consent_required')::text,
  'Without consent a premium user may not chat with Bite'
);
select results_eq(
  $$ select allowed, reason, call_id
     from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values (false, 'consent_required'::public.ai_access_reason, null::uuid) $$,
  'Without consent no call starts'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select reason from public.ai_access('coach_chat')), 'limit_reached',
  'A user who used the budget is told so before being asked to consent'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000f');
select is(
  (select reason from public.ai_access('meal_photo')), 'consent_required',
  'Without consent a free user with photos left may not send one'
);
select is(
  (select reason from public.ai_access('coach_chat')), 'plan_required',
  'A free user is told about premium before being asked to consent'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select is(
  (select reason from public.ai_access('meal_photo')), 'account_required',
  'A guest is told to make an account before being asked to consent'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into public.ai_consents (user_id, consent_version)
     values ('00000000-0000-0000-0000-00000000000f', '2026-11-18') $$,
  '42501',
  null,
  'A user cannot consent for another'
);
select lives_ok(
  $$ insert into public.ai_consents (consent_version) values ('2026-11-18') $$,
  'A user consents for themselves'
);
select is(
  (select row(allowed, reason)::text from public.ai_access('coach_chat')),
  row(true, null)::text,
  'With consent a premium user may chat with Bite'
);
select throws_ok(
  $$ update public.ai_consents set consent_version = 'x' $$,
  '42501',
  null,
  'A consent cannot be changed'
);
select throws_ok(
  $$ delete from public.ai_consents $$,
  '42501',
  null,
  'A consent cannot be deleted by the user'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000f');
select is(
  (select count(*) from public.ai_consents), 0::bigint,
  'Users read only their own consents'
);

-- Clients without a session, and whether a user consented, stay closed.
reset role;
select ok(
  not has_function_privilege('anon', 'public.has_ai_consent(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.has_ai_consent(uuid)', 'execute'),
  'Only ai_access() asks whether a user consented'
);
set local role anon;
select throws_ok(
  $$ select * from public.ai_consents $$,
  '42501',
  null,
  'anon cannot read consents'
);
select throws_ok(
  $$ insert into public.ai_consents (user_id, consent_version)
     values ('00000000-0000-0000-0000-00000000000a', '2026-11-18') $$,
  '42501',
  null,
  'anon cannot give a consent'
);
reset role;

select * from finish();
rollback;
