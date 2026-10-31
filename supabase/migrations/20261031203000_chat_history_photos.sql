-- The history tells a message of photos alone by its photos (#299, ADR 0062): the app shows
-- "Photo" or "2 photos" where such a message has no text for the last message's line, and for
-- the name of a thread it began, which coach_thread_title() leaves without one. As before
-- (20261030190000_chat_history_page_size.sql), with `last_photos` and `first_photos`.

-- How many photos a message holds, its image parts (ADR 0062).
create function public.coach_message_photos(content jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_array_elements(case when jsonb_typeof(content) = 'array' then content else '[]' end) as part
  where part ->> 'type' = 'image';
$$;

drop function public.my_coach_threads(text, timestamptz, bigint, integer);

-- `last_photos`: the photos of the last message. `first_photos`: the photos of the user's first
-- message when it has no text, and so named nothing; 0 otherwise.
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
  expression public.bite_expression
)
language sql
stable
set search_path = ''
as $$
  select t.id, t.title, t.last_message_at, left(last.text, 200), last.photos,
    coalesce(first.photos, 0), face.expression
  from public.coach_threads t
  join lateral (
    select public.coach_message_text(m.content) as text,
      public.coach_message_photos(m.content) as photos
    from public.coach_messages m
    where m.thread_id = t.id
    order by m.id desc
    limit 1
  ) last on true
  left join lateral (
    select case when coalesce(public.coach_message_text(m.content), '') = ''
      then public.coach_message_photos(m.content) else 0 end as photos
    from public.coach_messages m
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

-- The history, which runs as the caller, counts a message's photos.
revoke execute on function public.coach_message_photos(jsonb) from public, anon;
grant execute on function public.coach_message_photos(jsonb) to authenticated, service_role;
revoke execute on function public.my_coach_threads(text, timestamptz, bigint, integer)
  from public, anon;
grant execute on function public.my_coach_threads(text, timestamptz, bigint, integer)
  to authenticated;
