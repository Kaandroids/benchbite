-- A sign-up nobody confirmed holds its address, so its owner cannot use it, and it keeps an address
-- nobody proved (ADR 0091). A code works for 15 minutes; a day later the sign-up is gone. A guest is
-- left alone, whose address is only pending.
create function public.remove_unconfirmed_users()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users
  where email_confirmed_at is null
    and last_sign_in_at is null
    and not is_anonymous
    and created_at < now() - interval '1 day';
$$;

revoke execute on function public.remove_unconfirmed_users() from public, anon, authenticated;

select cron.schedule(
  'remove-unconfirmed-users', '0 * * * *', 'select public.remove_unconfirmed_users()'
);
