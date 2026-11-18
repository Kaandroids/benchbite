-- Withdrawing the consent to the AI features (#656, ADR 0143): it is recorded, deletes the
-- caller's chats and notes and queues their media, keeps what has another basis, leaves other
-- users alone, and makes ai_access() ask for the consent again.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- A and B are premium and have consented; both chat with Bite.
insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false);
insert into public.ai_consents (user_id, consent_version)
select id, '2026-11-18' from auth.users where id::text like '00000000-0000-0000-0000-%';
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
select id, 'premium', now() - interval '1 day', now() + interval '29 days', 'monthly', 'manual'
from auth.users where id::text like '00000000-0000-0000-0000-%';

insert into public.coach_threads (id, user_id) overriding system value values
  (1, '00000000-0000-0000-0000-00000000000a'),
  (2, '00000000-0000-0000-0000-00000000000a'),
  (3, '00000000-0000-0000-0000-00000000000b');
insert into public.coach_messages (thread_id, role, content) values
  (1, 'user', '[{"type": "text", "text": "Knee pain on squats"}]'),
  (2, 'user', '[{"type": "text", "text": "Lunch ideas"}]'),
  (3, 'user', '[{"type": "text", "text": "Knee advice"}]');
insert into public.coach_notes (user_id, category, text, thread_id) values
  ('00000000-0000-0000-0000-00000000000a', 'health', 'Knee hurts on deep squats', 1),
  ('00000000-0000-0000-0000-00000000000b', 'health', 'Bad knee', 3);
insert into public.coach_stops (user_id, request_id) values
  ('00000000-0000-0000-0000-00000000000a', gen_random_uuid());
insert into public.weight_entries (user_id, weight_kg) values
  ('00000000-0000-0000-0000-00000000000a', 80);
insert into public.ai_usage
  (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
   thinking_tokens, cost_usd)
values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'test',
  0, 0, 0, 0, 0.01);
delete from public.coach_media_deletions;

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.withdraw_ai_consent() $$, 'A user withdraws their AI consent');
select is(
  (select count(*) from public.ai_consent_withdrawals), 1::bigint,
  'The withdrawal is recorded'
);
select is(
  (select reason from public.ai_access('coach_chat')), 'consent_required',
  'After it, Bite asks for the consent again'
);
select is(
  (select count(*) from public.ai_consents), 1::bigint,
  'The consent stays, as proof'
);
select throws_ok(
  $$ select public.withdraw_ai_consent() $$,
  'BB060',
  null,
  'A consent cannot be withdrawn twice'
);
select throws_ok(
  $$ insert into public.ai_consent_withdrawals (user_id)
     values ('00000000-0000-0000-0000-00000000000b') $$,
  '42501',
  null,
  'Withdrawals are written only by withdraw_ai_consent()'
);

reset role;
select is(
  (select count(*) from public.coach_threads where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'Its chats are deleted'
);
select is(
  (select count(*) from public.coach_messages where thread_id in (1, 2)), 0::bigint,
  'with their messages'
);
select results_eq(
  $$ select thread_id from public.coach_media_deletions order by thread_id $$,
  $$ values (1::bigint), (2::bigint) $$,
  'and their photos and voice messages are queued for the purge'
);
select is(
  (select count(*) from public.coach_notes where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'Bite''s notebook is deleted'
);
select is(
  (select count(*) from public.coach_stops where user_id = '00000000-0000-0000-0000-00000000000a'),
  0::bigint,
  'and so are the stops of its answers'
);
select is(
  (select count(*) from public.weight_entries where user_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'The logs stay, as they rest on the health data consent'
);
select is(
  (select count(*) from public.ai_usage where user_id = '00000000-0000-0000-0000-00000000000a'),
  1::bigint,
  'and so does what the calls cost'
);
select is(
  (select count(*) from public.coach_threads t join public.coach_notes n using (user_id)
   where t.user_id = '00000000-0000-0000-0000-00000000000b'),
  1::bigint,
  'Another user''s chats and notes are untouched'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  (select count(*) from public.ai_consent_withdrawals), 0::bigint,
  'Users read only their own withdrawals'
);
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.ai_consent_withdrawals $$,
  '42501',
  null,
  'anon cannot read withdrawals'
);
reset role;

-- A consent given after the withdrawal counts again.
insert into public.ai_consents (user_id, consent_version, granted_at)
values ('00000000-0000-0000-0000-00000000000a', '2026-11-18', now() + interval '1 second');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select reason from public.ai_access('coach_chat')), null,
  'A consent given after the withdrawal counts'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.withdraw_ai_consent()', 'execute'),
  'anon cannot withdraw a consent'
);

select * from finish();
rollback;
