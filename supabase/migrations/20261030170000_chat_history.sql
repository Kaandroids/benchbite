-- Bite's chat history (#295, ADR 0055): a thread is named after its first message, and the
-- history lists the user's threads with the last message and Bite's last face, found by a word.

-- A thread's name from a message: its first words, up to 40 characters, cut where a word ends,
-- with an ellipsis when there is more. Made from the message, without asking the model.
create function public.coach_thread_title(message text)
returns text
language sql
immutable
set search_path = ''
as $$
  with words as (select trim(regexp_replace(message, '\s+', ' ', 'g')) as text)
  select case
    when w.text = '' then null
    when length(w.text) <= 40 then w.text
    else coalesce(substring(w.text from '^(.{1,39}\S)\s'), left(w.text, 39)) || '…'
  end
  from words w;
$$;

-- The text of a message, its text parts in order, joined by spaces for one line. The chat
-- function reads the same parts for the model, joined by lines (toMessage() in
-- supabase/functions/coach-chat/handler.ts).
create function public.coach_message_text(content jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(part ->> 'text', ' ' order by position)
  from jsonb_array_elements(content) with ordinality as parts (part, position)
  where part ->> 'type' = 'text';
$$;

-- Names a thread after its first message from the user. Only that one: a name the user cleared
-- later stays cleared.
create function public.name_coach_thread()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.coach_threads t
  set title = public.coach_thread_title(public.coach_message_text(new.content))
  where t.id = new.thread_id
    and t.title is null
    and not exists (
      select 1 from public.coach_messages m
      where m.thread_id = new.thread_id and m.role = 'user' and m.id < new.id
    );
  return null;
end;
$$;

revoke all on function public.name_coach_thread() from public, anon, authenticated;

create trigger coach_messages_name_thread
  after insert on public.coach_messages
  for each row when (new.role = 'user')
  execute function public.name_coach_thread();

comment on column public.coach_threads.title is
  'Named after the first message from the user by coach_messages_name_thread (ADR 0055); the user may rename it.';

-- The caller's threads for the history, latest first, 50 at a time: the name, when the last
-- message came, its text cut for a line, and Bite's last face. `search` finds a word in the name
-- or the whole last message, as food search does, İ and ı as i. The next page starts before the
-- last thread of this one, `before_at` and `before_id`. Threads without a message yet, as while
-- Bite answers the first one, and archived threads are left out. Runs as the caller, so the
-- policies keep it to their own.
create function public.my_coach_threads(
  search text default null,
  before_at timestamptz default null,
  before_id bigint default null
)
returns table (
  id bigint,
  title text,
  last_message_at timestamptz,
  last_message text,
  expression public.bite_expression
)
language sql
stable
set search_path = ''
as $$
  select t.id, t.title, t.last_message_at, left(last.text, 200), face.expression
  from public.coach_threads t
  join lateral (
    select public.coach_message_text(m.content) as text
    from public.coach_messages m
    where m.thread_id = t.id
    order by m.id desc
    limit 1
  ) last on true
  left join lateral (
    select m.expression
    from public.coach_messages m
    where m.thread_id = t.id and m.role = 'bite'
    order by m.id desc
    limit 1
  ) face on true
  where t.archived_at is null
    and (before_at is null or (t.last_message_at, t.id) < (before_at, coalesce(before_id, 0)))
    and (
      coalesce(trim(search), '') = ''
      or position(public.food_name_key(trim(search)) in public.food_name_key(coalesce(t.title, ''))) > 0
      or position(public.food_name_key(trim(search)) in public.food_name_key(coalesce(last.text, ''))) > 0
    )
  order by t.last_message_at desc, t.id desc
  limit 50;
$$;

-- Only the trigger names a thread, as whoever writes the message: the chat function.
revoke execute on function public.coach_thread_title(text) from public, anon, authenticated;
grant execute on function public.coach_thread_title(text) to service_role;
-- The trigger and the history, which runs as the caller, both read a message's text.
revoke execute on function public.coach_message_text(jsonb) from public, anon;
grant execute on function public.coach_message_text(jsonb) to authenticated, service_role;
revoke execute on function public.my_coach_threads(text, timestamptz, bigint) from public, anon;
grant execute on function public.my_coach_threads(text, timestamptz, bigint) to authenticated;
