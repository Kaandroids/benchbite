-- Checks the 1,000 before the 200 (ADR 0086): at both, deleting a food cannot make room, and being
-- told about the 200 would have the user delete one for nothing.
create or replace function public.check_custom_food_limit()
returns trigger
language plpgsql
-- Calls lock_user_limits(), which callers may not execute.
security definer
set search_path = ''
as $$
declare
  active integer;
  total integer;
begin
  perform public.lock_user_limits(new.user_id);
  select count(*) filter (where c.archived_at is null), count(*)
  into active, total
  from public.custom_foods c
  where c.user_id = new.user_id;
  if total >= 1000 then
    raise exception 'A user can add up to 1,000 foods, deleted ones included'
      using errcode = 'BB026';
  end if;
  if active >= 200 then
    raise exception 'A user can have up to 200 foods of their own' using errcode = 'BB024';
  end if;
  return new;
end;
$$;
