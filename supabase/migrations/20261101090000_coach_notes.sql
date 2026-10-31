-- Bite's notebook (#296, ADR 0071): what Bite knows about the user, such as an allergy or a knee
-- that hurts on deep squats, which it uses in every answer. Bite saves notes from the chat with
-- its tools, as the user, and the user sees, adds, edits and removes them in the notebook, so
-- plain row level security guards them. A note Bite archives, as an injury that healed, stays as
-- a past note, which answers leave out and the user can restore.
--
-- New error codes:
--   BB046  the user already has as many notes in use as they may have
--   BB047  the user has as many notes as they may keep, past ones included

create type public.coach_note_category as enum (
  'allergy', 'health', 'injury', 'training', 'food', 'goal', 'lifestyle'
);

-- Who wrote a note: Bite in a chat, the user, or the onboarding.
create type public.coach_note_source as enum ('chat', 'user', 'onboarding');

create table public.coach_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category public.coach_note_category not null,
  -- In the language the app showed when it was written, which the user reads it in. Bound as it
  -- is stored, spaces too, as every answer reads it (MAX_NOTE_LENGTH in coach-chat/tools.ts).
  text text not null check (length(text) <= 200 and length(trim(text)) >= 1),
  source public.coach_note_source not null default 'user',
  -- The chat a note of Bite's came from, and Bite's answer there, set once the answer is saved.
  thread_id bigint references public.coach_threads (id) on delete set null,
  message_id bigint references public.coach_messages (id) on delete set null,
  -- Bite saved it while the user has saving from chats off: it waits for their yes, outside the
  -- notebook and Bite's answers.
  asked boolean not null default false,
  -- When Bite asks whether it still holds, as for an injury.
  review_on date,
  archived_at timestamptz,
  -- Why Bite archived it, as the past notes show it.
  archive_reason text check (length(archive_reason) <= 200 and length(trim(archive_reason)) >= 1),
  check ((archived_at is null) = (archive_reason is null)),
  created_at timestamptz not null default now()
);

create index coach_notes_user_id on public.coach_notes (user_id, created_at);
create index coach_notes_thread_id on public.coach_notes (thread_id);
create index coach_notes_message_id on public.coach_notes (message_id);

-- Whether the user's own thread `thread_id` holds the message `message_id`, each when given: a
-- note names no one else's chat.
create function public.is_own_coach_message(thread_id bigint, message_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (
    is_own_coach_message.thread_id is null
      or exists (
        select 1 from public.coach_threads t
        where t.id = is_own_coach_message.thread_id and t.user_id = (select auth.uid())
      )
  ) and (
    is_own_coach_message.message_id is null
      or exists (
        select 1 from public.coach_messages m
        where m.id = is_own_coach_message.message_id
          and m.thread_id = is_own_coach_message.thread_id
      )
  );
$$;

revoke all on function public.is_own_coach_message(bigint, bigint) from public, anon;
grant execute on function public.is_own_coach_message(bigint, bigint) to authenticated;

alter table public.coach_notes enable row level security;

create policy "Users read their own notes"
  on public.coach_notes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own notes"
  on public.coach_notes for insert to authenticated
  with check (
    (select auth.uid()) = user_id and public.is_own_coach_message(thread_id, message_id)
  );
create policy "Users change their own notes"
  on public.coach_notes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and public.is_own_coach_message(thread_id, message_id)
  );
create policy "Users remove their own notes"
  on public.coach_notes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A note removed is added again as it was when the user undoes it, its time and chat included.
revoke all on public.coach_notes from anon;
revoke insert, update, truncate on public.coach_notes from authenticated;
grant insert (category, text, source, thread_id, message_id, asked, review_on, created_at)
  on public.coach_notes to authenticated;
grant update (category, text, message_id, asked, review_on, archived_at, archive_reason)
  on public.coach_notes to authenticated;

-- Up to 50 notes in use, which every answer reads, and up to 200 kept, past and asked ones
-- included. A note comes into use when it is added, restored or said yes to.
create function public.check_coach_note_limit()
returns trigger
language plpgsql
-- Calls lock_user_limits(), which callers may not execute.
security definer
set search_path = ''
as $$
declare
  in_use integer;
  kept integer;
begin
  perform public.lock_user_limits(new.user_id);
  select
    count(*) filter (where n.archived_at is null and not n.asked and n.id <> coalesce(new.id, 0)),
    count(*)
  into in_use, kept
  from public.coach_notes n
  where n.user_id = new.user_id;
  if new.archived_at is null and not new.asked
    and (tg_op = 'INSERT' or old.archived_at is not null or old.asked)
    and in_use >= 50 then
    raise exception 'A user can have up to 50 notes in use' using errcode = 'BB046';
  end if;
  if tg_op = 'INSERT' and kept >= 200 then
    raise exception 'A user can keep up to 200 notes' using errcode = 'BB047';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_coach_note_limit() from public, anon, authenticated;

create trigger coach_notes_check_limit
  before insert or update of archived_at, asked on public.coach_notes
  for each row execute function public.check_coach_note_limit();

-- Whether Bite saves notes from chats by itself; when off, it asks first.
alter table public.profiles
  add column coach_saves_notes boolean not null default true;

grant update (coach_saves_notes) on public.profiles to authenticated;
