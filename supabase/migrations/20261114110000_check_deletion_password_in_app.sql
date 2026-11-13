-- The password that confirms deleting an account is checked by the app, signing in from the phone,
-- not by delete-account (#531, ADR 0127). Auth limits signing in per IP, and the function's IP was
-- everyone's, so all users shared 20 tries in 5 minutes: a few accounts could use them up for all.
-- The function now only asks whether the token's password sign-in is recent, and whether the
-- password changed in the last day, so the count of its tries goes.
drop function public.take_account_deletion_password_try(uuid);
-- It served only the count of all users' tries together.
drop index public.account_deletion_tries_kind_created_at_idx;
-- Password tries are no longer recorded.
delete from public.account_deletion_tries where kind = 'password';
alter table public.account_deletion_tries
  drop constraint account_deletion_tries_kind_check,
  add constraint account_deletion_tries_kind_check check (kind in ('code_sent', 'wrong_code'));

-- Whether the user's password changed in the last day. A session that signed in recently can set a
-- new password without the old (ADR 0093), so a password that new proves nothing about who asks.
create function public.password_changed_lately(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select from public.password_changes
    where user_id = p_user and changed_at > now() - interval '1 day'
  );
$$;

-- Only the delete-account function calls it, with the service role (ADR 0126).
grant execute on function public.password_changed_lately(uuid) to service_role;
