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

-- The text of a message, its text parts in order.
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

-- Names a thread after its first message from the user, when it has no name yet.
create function public.name_coach_thread()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.coach_threads
  set title = public.coach_thread_title(public.coach_message_text(new.content))
  where id = new.thread_id and title is null;
  return null;
end;
$$;

revoke all on function public.name_coach_thread() from public, anon, authenticated;

create trigger coach_messages_name_thread
  after insert on public.coach_messages
  for each row when (new.role = 'user')
  execute function public.name_coach_thread();

-- The caller's threads for the history, latest first: the name, when the last message came, its
-- text and Bite's last face; `search` finds a word in the name or the last message. Archived
-- threads are left out. Runs as the caller, so the policies keep it to their own.
create function public.my_coach_threads(search text default null)
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
  with pattern as (
    -- The word as it is, with LIKE's wildcards taken literally.
    select '%' || regexp_replace(trim(search), '([\\%_])', '\\\1', 'g') || '%' as text
  )
  select t.id, t.title, t.last_message_at, last.text, face.expression
  from public.coach_threads t
  left join lateral (
    select left(public.coach_message_text(m.content), 200) as text
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
  cross join pattern p
  where t.archived_at is null
    and (
      coalesce(trim(search), '') = ''
      or t.title ilike p.text
      or last.text ilike p.text
    )
  order by t.last_message_at desc, t.id desc
  limit 200;
$$;

revoke execute on function public.coach_thread_title(text) from public, anon;
grant execute on function public.coach_thread_title(text) to authenticated;
revoke execute on function public.coach_message_text(jsonb) from public, anon;
grant execute on function public.coach_message_text(jsonb) to authenticated;
revoke execute on function public.my_coach_threads(text) from public, anon;
grant execute on function public.my_coach_threads(text) to authenticated;
