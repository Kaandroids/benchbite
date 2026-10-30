-- Bite's chat history: threads named after their first message, listed latest first with the last
-- message and Bite's last face, found by a word, each user's own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

select is(public.coach_thread_title('  How was   my week? '), 'How was my week?', 'A short message is the name');
select is(
  public.coach_thread_title('My left knee hurts on squats, can we change today''s workout?'),
  'My left knee hurts on squats, can we…',
  'A long one is cut where a word ends'
);
select is(
  public.coach_thread_title(repeat('a', 60)),
  repeat('a', 39) || '…',
  'A word too long for the name is cut'
);
select is(
  public.coach_message_text('[{"type": "text", "text": "One"}, {"type": "toolCall", "name": "x"}, {"type": "text", "text": "two"}]'),
  'One two',
  'A message''s text is its text parts in order'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The chat function writes A's two threads and one of B's.
set local role service_role;
insert into public.coach_threads (id, user_id, last_message_at) overriding system value values
  (1, '00000000-0000-0000-0000-00000000000a', now() - interval '2 days'),
  (2, '00000000-0000-0000-0000-00000000000a', now() - interval '2 days'),
  (3, '00000000-0000-0000-0000-00000000000b', now() - interval '2 days');
insert into public.coach_messages (thread_id, role, content, expression, created_at) values
  (1, 'user', '[{"type": "text", "text": "Knee pain on squats"}]', null, now() - interval '1 day'),
  (1, 'bite', '[{"type": "text", "text": "Try leg press today."}]', 'neutral', now() - interval '1 day'),
  (2, 'user', '[{"type": "text", "text": "Lunch ideas"}]', null, now() - interval '1 hour'),
  (2, 'bite', '[{"type": "text", "text": "A chicken rice bowl."}]', 'happy', now() - interval '1 hour'),
  (2, 'user', '[{"type": "text", "text": "Something with fish?"}]', null, now() - interval '30 minutes'),
  (3, 'user', '[{"type": "text", "text": "Knee advice"}]', null, now());

select is(
  (select title from public.coach_threads where id = 2),
  'Lunch ideas',
  'A thread is named after its first message, not a later one'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select id, title, last_message, expression::text from public.my_coach_threads() $$,
  $$ values
    (2::bigint, 'Lunch ideas', 'Something with fish?', 'happy'),
    (1::bigint, 'Knee pain on squats', 'Try leg press today.', 'neutral') $$,
  'A''s threads, latest first, with the last message and Bite''s last face, not B''s'
);
select results_eq(
  $$ select id from public.my_coach_threads('KNEE') $$,
  $$ values (1::bigint) $$,
  'A word finds a thread by its name, in any case'
);
select results_eq(
  $$ select id from public.my_coach_threads('fish') $$,
  $$ values (2::bigint) $$,
  'or by its last message'
);
select is_empty($$ select id from public.my_coach_threads('%') $$, 'A wildcard is taken as it is');
select is(
  (select count(*) from public.my_coach_threads('  ')),
  2::bigint,
  'A blank search lists them all'
);

update public.coach_threads set title = 'Knee' where id = 1;
select is(
  (select title from public.my_coach_threads() where id = 1),
  'Knee',
  'The user renames a thread'
);
update public.coach_threads set archived_at = now() where id = 1;
select is(
  (select count(*) from public.my_coach_threads()),
  1::bigint,
  'An archived thread is left out'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.my_coach_threads(text)', 'execute')
    and has_function_privilege('authenticated', 'public.my_coach_threads(text)', 'execute'),
  'Signed-in users list their threads; guests without an account may not'
);

select * from finish();
rollback;
