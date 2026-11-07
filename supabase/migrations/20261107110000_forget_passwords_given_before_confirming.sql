-- Auth keeps the first password given for an address nobody confirmed, which could be someone
-- else's. The app sets the password again right after the code, but if that step fails, the
-- account has no password rather than theirs, and a password reset gives it one (ADR 0091).
create function public.forget_password_given_before_confirming()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An empty password, as Auth keeps for a user without one, matches no password.
  new.encrypted_password := '';
  return new;
end;
$$;

revoke execute on function public.forget_password_given_before_confirming()
  from public, anon, authenticated;

create trigger forget_password_given_before_confirming
  before update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.forget_password_given_before_confirming();
