-- Removes guests nobody has used for 90 days (#535, ADR 0131). A guest cannot sign in again once
-- their session is gone, and remove_unconfirmed_users() leaves guests alone, so without this their
-- data stayed forever. A guest's photos can only be removed through the Storage API, so a scheduled
-- job calls the remove-inactive-guests function, which deletes them as deleting an account does.

-- How long a guest may go unused before they are removed.
create function public.guest_inactivity_period()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '90 days';
$$;

-- The guests last active before p_before, or only p_user when it is given. A guest's last activity
-- is the latest of their creation, their sign-in, which sets last_sign_in_at, and each refresh of a
-- session, which the app makes whenever it is opened after its token expired and which sets the
-- session's updated_at. Every rule about inactive guests asks this function.
create function public.inactive_guests_since(p_before timestamptz, p_user uuid default null)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous
    and (p_user is null or u.id = p_user)
    and greatest(
      u.created_at,
      u.last_sign_in_at,
      (select max(s.updated_at) from auth.sessions s where s.user_id = u.id)
    ) < p_before;
$$;

revoke execute on function public.guest_inactivity_period() from service_role;
revoke execute on function public.inactive_guests_since(timestamptz, uuid) from service_role;

-- Up to p_limit guests inactive for longer than the period, in random order, so that guests whose
-- removal keeps failing cannot hold up the others.
create function public.inactive_guests(p_limit integer)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g
  from public.inactive_guests_since(now() - public.guest_inactivity_period()) g
  order by random()
  limit p_limit;
$$;

-- Whether the guest is still inactive, asked right before they are deleted, as they may have come
-- back since they were found.
create function public.guest_still_inactive(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select from public.inactive_guests_since(now() - public.guest_inactivity_period(), p_user)
  );
$$;

grant execute on function public.inactive_guests(integer) to service_role;
grant execute on function public.guest_still_inactive(uuid) to service_role;

comment on function public.inactive_guests(integer) is
  'Guests inactive for longer than guest_inactivity_period(), which remove-inactive-guests deletes.';

-- Whether the removal has stopped working: a guest is still there a day after the period ran out,
-- though every hourly run removes guests until none are left or its time is up. Only failing runs,
-- or far more guests a day than a run can remove, leave one that long.
create function public.inactive_guest_removal_stalled()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select from public.inactive_guests_since(
      now() - public.guest_inactivity_period() - interval '1 day'
    )
  );
$$;

revoke execute on function public.inactive_guest_removal_stalled() from service_role;

-- Calls an Edge Function from a scheduled job, as Supabase schedules them: the project URL and a
-- secret API key are read from Vault when the job runs, so that no key is kept in the migrations.
-- Without them the call is skipped with a warning. Returns the pg_net request id, or null when
-- nothing was sent.
create function public.call_scheduled_function(p_name text)
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
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.call_scheduled_function(text) from service_role;

-- As before (ADR 0067), with the call made by call_scheduled_function().
create or replace function public.request_coach_media_purge()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  oldest timestamptz;
  request_id bigint;
begin
  select min(queued_at) into oldest from public.coach_media_deletions;
  if oldest is null then
    return null;
  end if;
  if public.coach_media_purge_stalled() then
    raise warning 'purge-coach-media is failing: a folder has been queued since %', oldest;
  end if;

  request_id := public.call_scheduled_function('purge-coach-media');
  if request_id is null then
    return null;
  end if;

  delete from public.coach_media_purge_requests where requested_at < now() - interval '1 day';
  insert into public.coach_media_purge_requests (request_id) values (request_id);
  return request_id;
end;
$$;

-- Calls remove-inactive-guests while there are guests to remove, and warns while the removal has
-- stopped working. Returns the pg_net request id, or null when nothing was sent.
create function public.request_inactive_guest_removal()
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select from public.inactive_guests(1)) then
    return null;
  end if;
  if public.inactive_guest_removal_stalled() then
    raise warning 'remove-inactive-guests is failing or falling behind: a guest is past the period';
  end if;
  return public.call_scheduled_function('remove-inactive-guests');
end;
$$;

revoke execute on function public.request_inactive_guest_removal() from service_role;

select cron.schedule(
  'remove-inactive-guests',
  '20 * * * *',
  'select public.request_inactive_guest_removal()'
);
