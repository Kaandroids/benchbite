-- Removes guests nobody has used for 90 days (#535, ADR 0131). A guest cannot sign in again once
-- their session is gone, and remove_unconfirmed_users() leaves guests alone, so without this their
-- data stayed forever. A guest's photos can only be removed through the Storage API, so a scheduled
-- job calls the remove-inactive-guests function, which deletes them as deleting an account does.

-- When the user was last active: signing in sets last_sign_in_at, and each refresh of a session,
-- which the app makes whenever it is opened after its token expired, sets the session's updated_at.
create function public.last_active_at(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    u.created_at,
    u.last_sign_in_at,
    (select max(s.updated_at) from auth.sessions s where s.user_id = u.id)
  )
  from auth.users u
  where u.id = p_user;
$$;

revoke execute on function public.last_active_at(uuid) from service_role;

-- Up to p_limit guests inactive for 90 days, in random order, so that guests whose removal keeps
-- failing cannot hold up the others.
create function public.inactive_guests(p_limit integer)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous
    and public.last_active_at(u.id) < now() - interval '90 days'
  order by random()
  limit p_limit;
$$;

grant execute on function public.inactive_guests(integer) to service_role;

comment on function public.inactive_guests(integer) is
  'Guests inactive for 90 days, which remove-inactive-guests deletes.';

-- Calls remove-inactive-guests while there are guests to remove, as request_coach_media_purge()
-- calls purge-coach-media: the project URL and a secret API key are read from Vault when the job
-- runs, and without them the call is skipped with a warning. A guest inactive for a day longer than
-- the period means the removal keeps failing, so it warns as well. Returns the pg_net request id, or
-- null when nothing was sent.
create function public.request_inactive_guest_removal()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  project_url text;
  secret_key text;
begin
  if not exists (select from public.inactive_guests(1)) then
    return null;
  end if;
  if exists (
    select from auth.users u
    where u.is_anonymous and public.last_active_at(u.id) < now() - interval '91 days'
  ) then
    raise warning 'remove-inactive-guests is failing: a guest has been inactive for over 91 days';
  end if;

  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret_key from vault.decrypted_secrets where name = 'secret_key';
  if project_url is null or secret_key is null then
    raise warning 'remove-inactive-guests is not called: set project_url and secret_key in Vault';
    return null;
  end if;

  return net.http_post(
    url := project_url || '/functions/v1/remove-inactive-guests',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.request_inactive_guest_removal() from service_role;

select cron.schedule(
  'remove-inactive-guests',
  '20 * * * *',
  'select public.request_inactive_guest_removal()'
);
