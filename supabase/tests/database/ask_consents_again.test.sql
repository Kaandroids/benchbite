-- The consents are asked for again when their text changes (#690, ADR 0159): a user renews the
-- health data consent for the current version only, and the AI features ask again at their next
-- use once the AI consent was given to an older text.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- A and B consented to the health data text and, as premium users, to the AI features. C
-- withdrew the health data consent.
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', false);
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
select id, 'premium', now() - interval '1 day', now() + interval '29 days', 'monthly', 'manual'
from auth.users where email in ('a@example.com', 'b@example.com');

-- The texts as the migrations left them.
delete from public.agreement_versions where agreement in ('health_consent', 'ai_consent');
insert into public.agreement_versions (agreement, version, applies_at) values
  ('health_consent', '2026-10-21', '2026-10-21'),
  ('ai_consent', '2026-11-18', '2026-11-18');
insert into public.health_data_consents (user_id, policy_version, granted_at)
select id, '2026-10-21', '2026-10-21' from auth.users
where email in ('a@example.com', 'b@example.com', 'c@example.com');
insert into public.health_data_consent_withdrawals (user_id, withdrawn_at)
values ('00000000-0000-0000-0000-00000000000c', now() - interval '1 day');
insert into public.ai_consents (user_id, consent_version, granted_at)
select id, '2026-11-18', '2026-11-18' from auth.users
where email in ('a@example.com', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select allowed from public.ai_access('coach_chat')), true,
  'A consent to the current text opens Bite'
);

-- Both texts change.
reset role;
insert into public.agreement_versions (agreement, version, applies_at) values
  ('health_consent', '2027-02-01', now() + interval '30 days'),
  ('ai_consent', '2027-02-01', now() + interval '30 days');

set local role anon;
select throws_ok(
  $$ select public.give_health_consent('2027-02-01') $$, '42501', null,
  'A client without a session cannot consent'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.give_health_consent('2026-10-21') $$, 'BB066', null,
  'The consent cannot be renewed for an older text'
);
select throws_ok(
  $$ select public.give_health_consent(null) $$, 'BB066', null, 'nor for none'
);
select lives_ok(
  $$ select public.give_health_consent('2027-02-01') $$, 'It can for the current text'
);
select lives_ok(
  $$ select public.give_health_consent('2027-02-01') $$, 'Giving it again is fine'
);
select is(
  (select array_agg(policy_version order by granted_at) from public.health_data_consents),
  array['2026-10-21', '2027-02-01'],
  'It is added once to the history, which keeps the consent before it'
);
select throws_ok(
  $$ insert into public.health_data_consents (user_id, policy_version)
     values ('00000000-0000-0000-0000-00000000000a', '2099-01-01') $$,
  '42501', null, 'Nobody writes a consent directly'
);
select throws_ok(
  $$ select public.ai_consent_is_current('00000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'nor asks the rule about anyone'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.give_health_consent('2027-02-01') $$, 'BB062', null,
  'A withdrawn consent is not renewed: the onboarding asks from the start'
);

-- The AI consent to the older text.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select row(allowed, reason)::text from public.ai_access('coach_chat')),
  row(false, 'consent_required')::text,
  'Bite asks for the consent again once its text changed'
);
select is(
  (select reason from public.ai_access('meal_photo')), 'consent_required',
  'and so do meals from photos'
);
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values (false, 'consent_required'::public.ai_access_reason) $$,
  'No call starts on the older consent'
);
select is(
  (select ai_given_at is not null from public.my_consents()), true,
  'The consent still holds for what rests on it, and can be withdrawn'
);
select throws_ok(
  $$ insert into public.ai_consents (consent_version) values ('2026-11-18') $$, 'BB066', null,
  'A consent to the older text is refused, which would open nothing'
);
select is(
  (select count(*) from public.ai_consents), 1::bigint, 'and adds no row'
);
insert into public.ai_consents (consent_version) values ('2027-02-01');
select is(
  (select allowed from public.ai_access('coach_chat')), true,
  'Consenting to the new text opens Bite again'
);

-- As the owner, who sees every user's rows.
reset role;
select is(
  (select count(*) from public.health_data_consents
   where user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint, 'Nobody else''s consents change'
);
delete from public.agreement_versions where agreement = 'ai_consent';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select allowed from public.ai_access('coach_chat')), true,
  'Without a current version on the server a consent counts as current'
);

select * from finish();
rollback;
