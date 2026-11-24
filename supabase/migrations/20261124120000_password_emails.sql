-- Emails the owner when an account's password is saved (#481, ADR 0167): a welcome for its first
-- password, which completes the account (ADR 0091), and "your password was changed" for any later
-- one. Auth's own notification said the latter for the first password too, so it is off, and the
-- database tells the two apart: the first password follows an empty one, as an account has none
-- until its address is confirmed. It runs on the server, so a change made outside the app is told
-- too.

-- Calls an Edge Function as call_scheduled_function() did (ADR 0131), now with a body and a
-- timeout of its own, as a trigger calls one too. Replaced rather than given new parameters in
-- place, which would make a second function and the jobs' calls by name ambiguous.
drop function public.call_scheduled_function(text);

create function public.call_scheduled_function(
  p_name text,
  p_body jsonb default '{}'::jsonb,
  p_timeout_ms integer default 60000
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  project_url text;
  secret_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret_key from vault.decrypted_secrets where name = 'secret_key';
  if project_url is null or secret_key is null then
    raise warning '% is not called: set project_url and secret_key in Vault', p_name;
    return null;
  end if;

  return net.http_post(
    url := project_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
    body := p_body,
    timeout_milliseconds := p_timeout_ms
  );
end;
$$;

revoke execute on function public.call_scheduled_function(text, jsonb, integer) from service_role;

-- Asks send-password-email to email the user, through call_scheduled_function() (ADR 0131). The
-- request goes once the change is committed, and goes nowhere if it is not. Nothing here may stop
-- a password from being saved: without the keys, or on any failure, it warns and the password is
-- saved without its email.
create function public.request_password_email()
returns trigger
language plpgsql
-- Reads Vault and queues the request, which Auth's role may not.
security definer
set search_path = ''
as $$
begin
  perform public.call_scheduled_function(
    'send-password-email',
    jsonb_build_object(
      'userId', new.id,
      'kind', case when coalesce(old.encrypted_password, '') = '' then 'welcome' else 'changed' end
    ),
    10000
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
