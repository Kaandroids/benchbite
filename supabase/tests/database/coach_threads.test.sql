-- Bite's conversations: only their owner reads them, renames, archives and deletes a thread; only
-- the chat function, with the service role, writes them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The chat function writes a thread of A's, with a turn of two messages.
set local role service_role;
insert into public.coach_threads (id, user_id, title, created_at, last_message_at)
  overriding system value
  values (1, '00000000-0000-0000-0000-00000000000a', 'Protein', '2026-10-29 10:00', '2026-10-29 10:00');
insert into public.coach_messages (thread_id, role, content, created_at) values
  (1, 'user', '[{"type": "text", "text": "Enough protein today?"}]', '2026-10-29 12:00');
insert into public.coach_messages
  (thread_id, role, content, expression, model, input_tokens, output_tokens, thinking_tokens,
   cached_input_tokens, created_at)
  values (1, 'bite', '[{"type": "text", "text": "Yes, 140 g."}]', 'happy',
    'gemini-3.5-flash-lite', 900, 40, 10, 800, '2026-10-29 12:00');

select is(
  (select last_message_at from public.coach_threads where id = 1),
  '2026-10-29 12:00'::timestamptz,
  'A new message moves its thread up the history'
);

insert into public.coach_messages (thread_id, role, content, created_at) values
  (1, 'user', '[{"type": "text", "text": "Late."}]', '2026-10-29 11:00');
select is(
  (select last_message_at from public.coach_threads where id = 1),
  '2026-10-29 12:00'::timestamptz,
  'and an older one does not move it back'
);

select throws_ok(
  $$ insert into public.coach_messages (thread_id, role, content, model)
     values (1, 'user', '[{"type": "text", "text": "Hi"}]', 'gemini') $$,
  '23514', null,
  'Only Bite''s messages have a model, usage and expression'
);
select throws_ok(
  $$ insert into public.coach_messages (thread_id, role, content) values (1, 'user', '[]') $$,
  '23514', null,
  'A message has at least one part'
);
select throws_ok(
  $$ insert into public.coach_messages (thread_id, role, content)
     values (1, 'user', '{"type": "text"}') $$,
  '23514', null,
  'and its parts are a list'
);
select throws_ok(
  format(
    $$ insert into public.coach_messages (thread_id, role, content)
       values (1, 'user', jsonb_build_array(jsonb_build_object('type', 'text', 'text', %L))) $$,
    repeat('a', 70000)
  ),
  '23514', null,
  'of a limited size'
);

-- A reads their thread and its messages.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select role::text, content ->> 0 from public.coach_messages order by id $$,
  $$ values
       ('user', '{"text": "Enough protein today?", "type": "text"}'),
       ('bite', '{"text": "Yes, 140 g.", "type": "text"}'),
       ('user', '{"text": "Late.", "type": "text"}') $$,
  'Users read the messages of their threads'
);

select throws_ok(
  $$ insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'Users add no threads themselves'
);
select throws_ok(
  $$ insert into public.coach_messages (thread_id, role, content)
     values (1, 'bite', '[{"type": "text", "text": "I said so."}]') $$,
  '42501', null,
  'nor messages, of Bite or their own'
);
select throws_ok(
  $$ update public.coach_messages set content = '[{"type": "text", "text": "No."}]' $$,
  '42501', null,
  'nor change one'
);
select throws_ok(
  $$ update public.coach_threads set last_message_at = now() $$,
  '42501', null,
  'nor move a thread in the history'
);

update public.coach_threads set title = 'Protein today', archived_at = '2026-10-30' where id = 1;
select results_eq(
  $$ select title, archived_at from public.coach_threads $$,
  $$ values ('Protein today', '2026-10-30'::timestamptz) $$,
  'Users rename and archive their threads'
);

-- B sees none of it and changes none of it.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select is_empty($$ select 1 from public.coach_threads $$, 'Users see no one else''s threads');
select is_empty($$ select 1 from public.coach_messages $$, 'nor their messages');

update public.coach_threads set title = 'Mine' where id = 1;
delete from public.coach_threads where id = 1;

-- A deletes the thread, and its messages with it.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select is(
  (select title from public.coach_threads where id = 1),
  'Protein today',
  'Users change and delete no one else''s threads'
);

delete from public.coach_threads where id = 1;
set local role service_role;
select is_empty(
  $$ select 1 from public.coach_messages where thread_id = 1 $$,
  'Deleting a thread deletes its messages'
);

select * from finish();
rollback;
