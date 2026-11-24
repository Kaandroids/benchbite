-- Bite's chats are not kept for good (#728, ADR 0170): a chat goes 30 days after its last message,
-- one the user never wrote in after 7 days, with its media queued for the purge; its notes stay;
-- and photos and voice messages of a chat that goes on are found after 30 days and marked removed.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false);
insert into public.health_data_consents (user_id, policy_version)
  values ('00000000-0000-0000-0000-00000000000a', '2026-11-23');
insert into public.ai_consents (user_id, consent_version)
  values ('00000000-0000-0000-0000-00000000000a', '2026-11-18');

-- 1: last message 40 days ago. 2: last message 10 days ago. 3: never written in, made 8 days ago.
-- 4: never written in, made 2 days ago. 5: goes on, with a photo and a voice message 35 days old.
insert into public.coach_threads (id, user_id, created_at) overriding system value values
  (9000001, '00000000-0000-0000-0000-00000000000a', now() - interval '41 days'),
  (9000002, '00000000-0000-0000-0000-00000000000a', now() - interval '11 days'),
  (9000003, '00000000-0000-0000-0000-00000000000a', now() - interval '8 days'),
  (9000004, '00000000-0000-0000-0000-00000000000a', now() - interval '2 days'),
  (9000005, '00000000-0000-0000-0000-00000000000a', now() - interval '36 days');
insert into public.coach_messages (thread_id, role, content, created_at) values
  (9000001, 'user', '[{"type": "text", "text": "Old"}]', now() - interval '40 days'),
  (9000002, 'user', '[{"type": "text", "text": "Recent"}]', now() - interval '10 days'),
  (9000005, 'user', '[{"type": "text", "text": "Lunch"},
    {"type": "image", "path": "00000000-0000-0000-0000-00000000000a/5/a.jpg", "mimeType": "image/jpeg", "width": 800},
    {"type": "audio", "path": "00000000-0000-0000-0000-00000000000a/5/b.m4a", "mimeType": "audio/mp4", "durationMs": 4200}]',
    now() - interval '35 days'),
  (9000005, 'user', '[{"type": "image", "path": "00000000-0000-0000-0000-00000000000a/5/c.jpg", "mimeType": "image/jpeg"}]',
    now() - interval '1 day');
-- The thread's own time follows its messages; set as they would have been.
update public.coach_threads set last_message_at = now() - interval '40 days' where id = 9000001;
update public.coach_threads set last_message_at = now() - interval '10 days' where id = 9000002;
update public.coach_threads set last_message_at = now() - interval '8 days' where id = 9000003;
update public.coach_threads set last_message_at = now() - interval '2 days' where id = 9000004;
update public.coach_threads set last_message_at = now() - interval '1 day' where id = 9000005;
insert into public.coach_notes (user_id, category, text, thread_id) values
  ('00000000-0000-0000-0000-00000000000a', 'health', 'Knee hurts on deep squats', 9000001);
delete from public.coach_media_deletions;

-- A batch of one at a time goes on until none is left; other chats of the local database may go
-- too, so the count is at least these.
select cmp_ok(public.remove_old_coach_chats(1), '>=', 2, 'Chats past their time are removed, batch after batch');
select results_eq(
  $$ select id from public.coach_threads where id > 9000000 order by id $$,
  $$ values (9000002::bigint), (9000004), (9000005) $$,
  'A chat 30 days after its last message, and one never written in after 7 days, go'
);
select results_eq(
  $$ select thread_id from public.coach_media_deletions where thread_id > 9000000 order by thread_id $$,
  $$ values (9000001::bigint), (9000003) $$,
  'Their media go to the purge'
);
select results_eq(
  $$ select text, thread_id from public.coach_notes where text = 'Knee hurts on deep squats' $$,
  $$ values ('Knee hurts on deep squats', null::bigint) $$,
  'Bite''s notebook stays'
);

select results_eq(
  $$ select path from public.expiring_coach_media(1000) where path like '00000000-0000-0000-0000-00000000000a/%' order by path $$,
  $$ values ('00000000-0000-0000-0000-00000000000a/5/a.jpg'),
            ('00000000-0000-0000-0000-00000000000a/5/b.m4a') $$,
  'Photos and voice messages of a chat that goes on are found after 30 days, no sooner'
);
select public.forget_coach_media(array(
  select message_id from public.expiring_coach_media(1000)
  where path like '00000000-0000-0000-0000-00000000000a/%'
));
select is(
  (select content from public.coach_messages where thread_id = 9000005 order by id limit 1),
  '[{"type": "text", "text": "Lunch"},
    {"type": "image", "mimeType": "image/jpeg", "width": 800, "removed": true},
    {"type": "audio", "mimeType": "audio/mp4", "durationMs": 4200, "removed": true}]'::jsonb,
  'Once removed, a part keeps its type and size, loses its path, and says it was removed'
);
select is_empty(
  $$ select * from public.expiring_coach_media(1000)
     where path like '00000000-0000-0000-0000-00000000000a/%' $$,
  'and is found no more'
);

select ok(
  not has_function_privilege('authenticated', 'public.forget_coach_media(bigint[])', 'execute')
    and not has_function_privilege('authenticated', 'public.expiring_coach_media(integer)', 'execute'),
  'Users can neither find nor mark media themselves'
);
select ok(
  not has_function_privilege('service_role', 'public.remove_old_coach_chats(integer)', 'execute')
    and not has_function_privilege('service_role', 'public.request_coach_media_expiry()', 'execute'),
  'Only the scheduled jobs remove chats and ask for the expiry'
);
select results_eq(
  $$ select jobname from cron.job where jobname in ('remove-old-coach-chats', 'expire-coach-media')
     order by jobname $$,
  $$ values ('expire-coach-media'::text), ('remove-old-coach-chats') $$,
  'Both run on a schedule'
);

select * from finish();
rollback;
