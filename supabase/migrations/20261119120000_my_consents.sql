-- The consents the user gave that hold now, with when each was given, for the settings' privacy
-- section (#652). The server's rule decides what holds (has_health_consent(), has_ai_consent()),
-- so that the app does not keep a copy of it.
create function public.my_consents()
returns table (health_given_at timestamptz, ai_given_at timestamptz)
language sql
stable
-- Asks the consent rules, which are closed to clients.
security definer
set search_path = ''
as $$
  select
    case when public.has_health_consent((select auth.uid())) then (
      select max(c.granted_at) from public.health_data_consents c
      where c.user_id = (select auth.uid())
    ) end,
    case when public.has_ai_consent((select auth.uid())) then (
      select max(c.granted_at) from public.ai_consents c
      where c.user_id = (select auth.uid())
    ) end;
$$;

revoke execute on function public.my_consents() from public, anon;
grant execute on function public.my_consents() to authenticated;
