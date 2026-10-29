-- Bite's conversations (#291, ADR 0050): threads, which the chat history lists, and their
-- messages, in our own format rather than a provider's. The chat function (#292) writes both,
-- after it has checked the user's access and limit; the user reads them, renames and archives a
-- thread, and deletes it with its messages.

create type public.coach_role as enum ('user', 'bite');

-- The faces Bite answers with. Its thinking face is left out: it shows while Bite works out a
-- reply, never on an answer. The app's faces derive from this list (src/coach/bite-expressions.tsx).
create type public.bite_expression as enum ('neutral', 'happy', 'sad', 'angry', 'surprised');

create table public.coach_threads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Bite names a thread after its first answer; until then the history shows its first message.
  title text check (length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  -- Kept by a trigger, so that the history lists the latest conversation first.
  last_message_at timestamptz not null default now(),
  archived_at timestamptz
);

create index coach_threads_user_id_idx on public.coach_threads (user_id);
create index coach_threads_history_idx
  on public.coach_threads (user_id, last_message_at desc)
  where archived_at is null;

create table public.coach_messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.coach_threads (id) on delete cascade,
  role public.coach_role not null,
  -- The parts of the message, in order: text, tool calls and their results, cards, and paths of
  -- photos and voice in storage, never the media themselves. Their shapes are the chat
  -- function's (#292); here they are only kept to a size.
  content jsonb not null check (
    jsonb_typeof(content) = 'array'
    and jsonb_array_length(content) between 1 and 50
    and octet_length(content::text) <= 65536
  ),
  -- The face Bite makes as it answers.
  expression public.bite_expression,
  -- What Bite's answer used, as a record of the message; the usage log of #288 is what counts
  -- toward the user's limit.
  model text check (length(model) between 1 and 100),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  thinking_tokens integer check (thinking_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens >= 0),
  check (
    role = 'bite'
    or num_nonnulls(
      expression, model, input_tokens, output_tokens, thinking_tokens, cached_input_tokens
    ) = 0
  ),
  created_at timestamptz not null default now()
);

-- A thread's messages in order; both of a turn are written at the same time, so the id orders
-- them.
create index coach_messages_thread_idx on public.coach_messages (thread_id, id);

create function public.touch_coach_thread()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.coach_threads set last_message_at = new.created_at
  where id = new.thread_id and last_message_at < new.created_at;
  return null;
end;
$$;

revoke all on function public.touch_coach_thread() from public, anon, authenticated;

create trigger coach_messages_touch_thread
  after insert on public.coach_messages
  for each row execute function public.touch_coach_thread();

-- Users read their own threads and messages; they rename, archive and delete a thread, but
-- write no messages: the chat function adds both of a turn with the service role.
alter table public.coach_threads enable row level security;

create policy "Users read their own threads"
  on public.coach_threads for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users change their own threads"
  on public.coach_threads for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own threads"
  on public.coach_threads for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.coach_threads from anon;
revoke insert, update, delete, truncate on public.coach_threads from authenticated;
grant update (title, archived_at) on public.coach_threads to authenticated;
grant delete on public.coach_threads to authenticated;

alter table public.coach_messages enable row level security;

create policy "Users read the messages of their threads"
  on public.coach_messages for select to authenticated
  using (
    exists (
      select 1 from public.coach_threads t
      where t.id = thread_id and t.user_id = (select auth.uid())
    )
  );

revoke all on public.coach_messages from anon;
revoke insert, update, delete, truncate on public.coach_messages from authenticated;
