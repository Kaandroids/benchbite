-- Names the threads written before threads were named after their first message (ADR 0055), so
-- that the history shows them by name too.
update public.coach_threads t
set title = public.coach_thread_title(public.coach_message_text(m.content))
from (
  select distinct on (thread_id) thread_id, content
  from public.coach_messages
  where role = 'user'
  order by thread_id, id
) m
where m.thread_id = t.id and t.title is null;
