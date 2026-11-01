-- Bite's notebook: each user's notes are their own, in their own chats only, up to 50 in use and
-- 200 kept, 20 waiting for the user's yes, and saving from chats can be switched off (ADR 0071).
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;
insert into public.coach_messages (thread_id, role, content)
select id, 'bite', '[{"type": "text", "text": "Hi"}]' from ids where name = 'thread';
insert into ids select 'message', max(id) from public.coach_messages;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into ids select 'b thread', max(id) from public.coach_threads;
insert into public.coach_messages (thread_id, role, content)
select id, 'bite', '[{"type": "text", "text": "Hi"}]' from ids where name = 'b thread';
insert into ids select 'b message', max(id) from public.coach_messages;

create function pg_temp.id(name text) returns bigint language sql as $$
  select i.id from ids i where i.name = $1;
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ insert into public.coach_notes (category, text) values ('allergy', 'Allergic to walnuts') $$,
  'A user adds a note'
);
select results_eq(
  $$ select source::text, asked, user_id from public.coach_notes $$,
  $$ values ('user', false, '00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'A note is the user''s own, added by them'
);
select lives_ok(
  format(
    $$ insert into public.coach_notes (category, text, source, thread_id, message_id, review_on)
       values ('injury', 'Left knee hurts on deep squats', 'chat', %s, %s, current_date + 5) $$,
    pg_temp.id('thread'), pg_temp.id('message')
  ),
  'Bite saves a note from the user''s chat, as the user'
);
select throws_ok(
  format(
    $$ insert into public.coach_notes (category, text, thread_id) values ('food', 'x', %s) $$,
    pg_temp.id('b thread')
  ),
  '42501', null,
  'A note names no one else''s chat'
);
select throws_ok(
  format(
    $$ insert into public.coach_notes (category, text, thread_id, message_id)
       values ('food', 'x', %s, %s) $$,
    pg_temp.id('thread'), pg_temp.id('b message')
  ),
  '42501', null,
  'A note names no message outside its chat'
);
select throws_ok(
  $$ insert into public.coach_notes (category, text) values ('food', '   ') $$,
  '23514', null,
  'A note has text'
);
select throws_ok(
  $$ insert into public.coach_notes (category, text) values ('food', repeat(' ', 300) || 'x') $$,
  '23514', null,
  'A note is short as it is stored, spaces too'
);
select throws_ok(
  format(
    $$ update public.coach_notes set message_id = %s where category = 'allergy' $$,
    pg_temp.id('b message')
  ),
  '42501', null,
  'A note is not moved to another user''s message'
);
select throws_ok(
  $$ update public.coach_notes set user_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null,
  'Nor given to another user'
);
select throws_ok(
  $$ update public.coach_notes set source = 'onboarding' $$,
  '42501', null,
  'Nor said to come from elsewhere afterwards'
);
select throws_ok(
  $$ update public.coach_notes set archived_at = now() where category = 'injury' $$,
  '23514', null,
  'An archived note says why'
);
select lives_ok(
  $$ update public.coach_notes set archived_at = now(), archive_reason = 'The knee is fine again'
     where category = 'injury' $$,
  'Bite archives a note, with why'
);
select throws_ok(
  $$ insert into public.coach_notes (user_id, category, text)
     values ('00000000-0000-0000-0000-00000000000b', 'food', 'x') $$,
  '42501', null,
  'A user adds no note for another'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty($$ select 1 from public.coach_notes $$, 'Another user reads no one else''s notes');
update public.coach_notes set text = 'Changed';
delete from public.coach_notes;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select text from public.coach_notes order by id $$,
  $$ values ('Allergic to walnuts'), ('Left knee hurts on deep squats') $$,
  'Nor changes or removes them'
);

-- Up to 50 in use: a past note and one asked about do not count.
insert into public.coach_notes (category, text)
select 'food', 'Note ' || n from generate_series(2, 49) n;
insert into public.coach_notes (category, text, asked) values ('food', 'Asked', true);
select lives_ok(
  $$ insert into public.coach_notes (category, text) values ('food', 'The 50th') $$,
  'A user has 50 notes in use'
);
select throws_ok(
  $$ insert into public.coach_notes (category, text) values ('food', 'One more') $$,
  'BB046', null,
  'But not 51'
);
select throws_ok(
  $$ update public.coach_notes set archived_at = null, archive_reason = null
     where category = 'injury' $$,
  'BB046', null,
  'Nor by restoring a past note'
);
select throws_ok(
  $$ update public.coach_notes set asked = false where text = 'Asked' $$,
  'BB046', null,
  'Nor by saying yes to one asked about'
);
select lives_ok(
  $$ update public.coach_notes set text = 'Allergic to walnuts and pecans'
     where category = 'allergy' $$,
  'A note in use is still changed at the limit'
);

-- Up to 20 waiting for the user's yes.
insert into public.coach_notes (category, text, asked)
select 'food', 'Waiting ' || n, true from generate_series(2, 20) n;
select throws_ok(
  $$ insert into public.coach_notes (category, text, asked) values ('food', 'One more', true) $$,
  'BB048', null,
  'A user has up to 20 notes waiting for their yes'
);
select lives_ok(
  $$ update public.coach_notes set text = 'Still waiting' where text = 'Asked' $$,
  'One waiting is still changed at the limit'
);

reset role;
set local role anon;
select throws_ok(
  $$ select 1 from public.coach_notes $$,
  '42501', null,
  'Nobody signed out reads notes'
);
select throws_ok(
  $$ insert into public.coach_notes (category, text) values ('food', 'x') $$,
  '42501', null,
  'Nor adds one'
);
reset role;
select col_default_is(
  'public', 'profiles', 'coach_saves_notes', 'true',
  'Bite saves notes from chats unless the user switches it off'
);

select * from finish();
rollback;
