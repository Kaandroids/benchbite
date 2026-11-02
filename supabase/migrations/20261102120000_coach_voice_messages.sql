-- Voice messages to Bite (#298, ADR 0072) are kept as photos are (ADR 0062): in the private
-- `coach-media` bucket, in their thread's folder, which deleting the thread or the account queues
-- for removal (ADR 0063). The bucket now takes AAC in an MP4 container, as the app records it,
-- within the same size limit, which a minute of speech keeps well under.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'audio/mp4']
where id = 'coach-media';

-- The history tells a voice message apart, as it does photos (20261031203000_chat_history_photos.sql):
-- one that could not be written down has no text for the last message's line, nor for the name of
-- a thread it began. As before, with `last_voice` and `first_voice`.

-- Whether a message is a voice message, with an audio part (ADR 0072).
create function public.coach_message_voice(content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(content) = 'array' then content else '[]' end) as part
    where part ->> 'type' = 'audio'
  );
$$;

drop function public.my_coach_threads(text, timestamptz, bigint, integer);

-- `last_voice`: whether the last message is a voice message. `first_voice`: whether the user's
-- first message is a voice message without text, and so named nothing.
create function public.my_coach_threads(
  search text default null,
  before_at timestamptz default null,
  before_id bigint default null,
  page_size integer default 50
)
returns table (
  id bigint,
  title text,
  last_message_at timestamptz,
  last_message text,
  last_photos integer,
  first_photos integer,
  last_voice boolean,
  first_voice boolean,
  expression public.bite_expression
)
language sql
stable
set search_path = ''
as $$
  select t.id, t.title, t.last_message_at, left(last.text, 200), last.photos,
    coalesce(first.photos, 0), last.voice, coalesce(first.voice, false), face.expression
  from public.coach_threads t
  join lateral (
    select public.coach_message_text(m.content) as text,
      public.coach_message_photos(m.content) as photos,
      public.coach_message_voice(m.content) as voice
    from public.coach_messages m
    where m.thread_id = t.id
    order by m.id desc
    limit 1
  ) last on true
  left join lateral (
    select untitled and public.coach_message_voice(m.content) as voice,
      case when untitled then public.coach_message_photos(m.content) else 0 end as photos
    from public.coach_messages m,
      lateral (select coalesce(public.coach_message_text(m.content), '') = '' as untitled) u
    where m.thread_id = t.id and m.role = 'user'
    order by m.id
    limit 1
  ) first on true
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
  limit least(greatest(coalesce(page_size, 50), 1), 50);
$$;

-- The history, which runs as the caller, tells a voice message apart.
revoke execute on function public.coach_message_voice(jsonb) from public, anon;
grant execute on function public.coach_message_voice(jsonb) to authenticated, service_role;
revoke execute on function public.my_coach_threads(text, timestamptz, bigint, integer)
  from public, anon;
grant execute on function public.my_coach_threads(text, timestamptz, bigint, integer)
  to authenticated;
