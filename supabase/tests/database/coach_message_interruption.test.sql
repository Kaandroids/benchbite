-- Bite's answer keeps how it ended; the user's messages have no ending of their own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
-- They have consented to the AI features, which a chat needs (ADR 0143).
insert into public.ai_consents (user_id, consent_version)
select id, (select version from public.current_agreement('ai_consent')) from auth.users
where id not in (select user_id from public.ai_consents);
insert into public.coach_threads (id, user_id) overriding system value
  values (1, '00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ insert into public.coach_messages (thread_id, role, content, interrupted)
     values (1, 'bite', '[{"type": "text", "text": "Rest is"}]', 'stopped') $$,
  'An answer keeps that it was stopped'
);
select throws_ok(
  $$ insert into public.coach_messages (thread_id, role, content, interrupted)
     values (1, 'user', '[{"type": "text", "text": "Hi"}]', 'stopped') $$,
  '23514', null,
  'A message of the user''s has no ending'
);

select * from finish();
rollback;
