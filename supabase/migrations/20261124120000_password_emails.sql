-- Emails the owner when an account's password is saved (#481, ADR 0167): a welcome for its first
-- password, which completes the account (ADR 0091), and "your password was changed" for any later
-- one. Auth's own notification said the latter for the first password too, so it is off, and the
-- database tells the two apart: the first password follows an empty one, as an account has none
-- until its address is confirmed. It runs on the server, so a change made outside the app is told
-- too.

-- Asks send-password-email to email the user, with the project URL and a secret API key read from
-- Vault, as purge-coach-media is called (ADR 0063). The request goes once the change is committed,
-- and goes nowhere if it is not. Nothing here may stop a password from being saved: without the
-- keys, or on any failure, it warns and the password is saved without its email.
create function public.request_password_email()
returns trigger
language plpgsql
-- Reads Vault and queues the request, which Auth's role may not.
security definer
set search_path = ''
as $$
declare
  project_url text;
  secret_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret_key from vault.decrypted_secrets where name = 'secret_key';
  if project_url is null or secret_key is null then
    raise warning 'send-password-email is not called: set project_url and secret_key in Vault';
    return new;
  end if;
  perform net.http_post(
    url := project_url || '/functions/v1/send-password-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
    body := jsonb_build_object(
      'userId', new.id,
      'kind', case when coalesce(old.encrypted_password, '') = '' then 'welcome' else 'changed' end
    ),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'send-password-email is not called: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.request_password_email()
  from public, anon, authenticated, service_role;

-- A password saved, not one forgotten as an address is first confirmed (ADR 0091), and only for an
-- account with an address: a guest has none.
create trigger request_password_email
  after update of encrypted_password on auth.users
  for each row
  when (
    old.encrypted_password is distinct from new.encrypted_password
    and coalesce(new.encrypted_password, '') <> ''
    and new.email is not null
  )
  execute function public.request_password_email();
