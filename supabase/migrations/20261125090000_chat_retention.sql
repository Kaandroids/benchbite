-- Bite's chats are not kept for good (#728, ADR 0170): a chat goes 30 days after its last message,
-- one the user never wrote in after 7 days, and the photos and voice messages of a chat that goes
-- on go 30 days after they were sent. Bite's notebook and what Bite's cards logged stay. Deleting a
-- chat queues its folder of media for purge-coach-media (ADR 0063); a single file goes through
-- expire-coach-media, which removes it from storage and then marks it removed in its message.

-- Whether a part of a message is a photo or voice message whose file is kept, by its path: one
-- removed keeps its type and loses its path.
create function public.coach_media_part_kept(part jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select part ->> 'type' in ('image', 'audio') and part ? 'path';
$$;

-- Whether a chat is past its time: 30 days after its last message, or 7 days after it began when
-- the user never wrote in it.
create function public.coach_chat_past_its_time(t public.coach_threads)
returns boolean
language sql
stable
set search_path = ''
as $$
  select t.last_message_at < now() - interval '30 days'
    or (
      t.created_at < now() - interval '7 days'
      and not exists (
        select 1 from public.coach_messages m where m.thread_id = t.id and m.role = 'user'
      )
    );
$$;

-- Deletes the chats past their time, each with its messages, cards and proposals, a batch of
-- `p_limit` at a time until none is left; their media go to the purge through the delete's
-- trigger. A chat being written in is skipped, and its time is checked again as it is deleted,
-- so that a message just saved is never deleted with it. Returns how many went.
create function public.remove_old_coach_chats(p_limit integer default 500)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  batch integer;
  removed integer := 0;
begin
  loop
    with old as (
      select t.id from public.coach_threads t
      where public.coach_chat_past_its_time(t)
      order by t.last_message_at
      limit p_limit
      for update skip locked
    )
    delete from public.coach_threads t using old
    where t.id = old.id and public.coach_chat_past_its_time(t);
    get diagnostics batch = row_count;
    removed := removed + batch;
    exit when batch < p_limit;
  end loop;
  return removed;
end;
$$;

revoke execute on function public.coach_media_part_kept(jsonb) from public, anon, authenticated;
revoke execute on function public.coach_chat_past_its_time(public.coach_threads)
  from public, anon, authenticated;

revoke execute on function public.remove_old_coach_chats(integer)
  from public, anon, authenticated, service_role;

select cron.schedule(
  'remove-old-coach-chats',
  '10 3 * * *',
  'select public.remove_old_coach_chats()'
);

-- The photos and voice messages sent more than 30 days ago, of chats that go on, by message: the
-- paths expire-coach-media removes, at most `p_limit` messages a run.
create function public.expiring_coach_media(p_limit integer)
returns table (message_id bigint, path text)
language sql
stable
set search_path = ''
as $$
  select m.id, part ->> 'path'
  from (
    select m.id, m.content from public.coach_messages m
    where m.created_at < now() - interval '30 days'
      and exists (
        select 1 from jsonb_array_elements(m.content) p where public.coach_media_part_kept(p)
      )
    order by m.id
    limit p_limit
  ) m,
  jsonb_array_elements(m.content) part
  where public.coach_media_part_kept(part);
$$;

revoke execute on function public.expiring_coach_media(integer) from public, anon, authenticated;
grant execute on function public.expiring_coach_media(integer) to service_role;

-- Marks the photos and voice messages of these messages removed, once their files are gone: the
-- part keeps its type and size, and loses its path, which the app shows as removed. A voice
-- message keeps its length; what was said stays in the message's text.
create function public.forget_coach_media(p_message_ids bigint[])
returns void
language sql
set search_path = ''
as $$
  update public.coach_messages m
  set content = (
    select jsonb_agg(
      case
        when public.coach_media_part_kept(part)
          then (part - 'path') || jsonb_build_object('removed', true)
        else part
      end
      order by ordinality
    )
    from jsonb_array_elements(m.content) with ordinality as e(part, ordinality)
  )
  where m.id = any(p_message_ids);
$$;

revoke execute on function public.forget_coach_media(bigint[]) from public, anon, authenticated;
grant execute on function public.forget_coach_media(bigint[]) to service_role;

-- Calls expire-coach-media while a photo or voice message is past its time. Returns the pg_net
-- request id, or null when nothing was sent.
create function public.request_coach_media_expiry()
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select from public.expiring_coach_media(1)) then
    return null;
  end if;
  return public.call_scheduled_function('expire-coach-media');
end;
$$;

revoke execute on function public.request_coach_media_expiry()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'expire-coach-media',
  '25 * * * *',
  'select public.request_coach_media_expiry()'
);
