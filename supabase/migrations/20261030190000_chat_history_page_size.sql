-- The history's list takes a page size, so that Bite reads its last chat as one row rather than a
-- page of 50 (#295, ADR 0055). As before (20261030170000_chat_history.sql), with `page_size`, from
-- 1 to 50.
drop function public.my_coach_threads(text, timestamptz, bigint);

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
  limit least(greatest(coalesce(page_size, 50), 1), 50);
$$;

revoke execute on function public.my_coach_threads(text, timestamptz, bigint, integer)
  from public, anon;
grant execute on function public.my_coach_threads(text, timestamptz, bigint, integer)
  to authenticated;
