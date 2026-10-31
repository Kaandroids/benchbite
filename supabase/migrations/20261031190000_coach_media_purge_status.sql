-- Reports whether the photo purge of deleted chats is working (#368, ADR 0067), for the scheduled
-- Monitor workflow. A failing purge only warns in the Postgres logs, and cron still reports
-- its runs as succeeded, so the workflow asks this function and fails when it is unhealthy.

-- The pg_net requests sent to purge-coach-media. pg_net's responses carry no URL, so without these
-- ids a response cannot be told apart from those of other calls. Kept for a day; pg_net keeps its
-- responses for six hours.
create table public.coach_media_purge_requests (
  request_id bigint primary key,
  requested_at timestamptz not null default now()
);

alter table public.coach_media_purge_requests enable row level security;
revoke all on public.coach_media_purge_requests from anon, authenticated;

comment on table public.coach_media_purge_requests is
  'pg_net request ids of the calls to purge-coach-media, to find their responses.';

-- As before, and records the id of each request it sends.
create or replace function public.request_coach_media_purge()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  oldest timestamptz;
  project_url text;
  secret_key text;
  request_id bigint;
begin
  select min(queued_at) into oldest from public.coach_media_deletions;
  if oldest is null then
    return null;
  end if;
  if oldest < now() - interval '1 hour' then
    raise warning 'purge-coach-media is failing: a folder has been queued since %', oldest;
  end if;

  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret_key from vault.decrypted_secrets where name = 'secret_key';
  if project_url is null or secret_key is null then
    raise warning 'purge-coach-media is not called: set project_url and secret_key in Vault';
    return null;
  end if;

  request_id := net.http_post(
    url := project_url || '/functions/v1/purge-coach-media',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );

  delete from public.coach_media_purge_requests where requested_at < now() - interval '1 day';
  insert into public.coach_media_purge_requests (request_id) values (request_id);
  return request_id;
end;
$$;

-- Only counts, ages and status codes, never user ids or folders, as the workflow's log is public.
-- The purge is unhealthy when a folder has waited over an hour, as it is tried every five
-- minutes, or when the latest answered call was not a 2xx; a timeout or a network error has no
-- status code and counts as failed. It runs as its caller, the database owner, as which the
-- workflow queries through the Management API.
create function public.coach_media_purge_status()
returns table (
  queued bigint,
  oldest_queued_minutes integer,
  responses bigint,
  failed_responses bigint,
  failed_statuses integer[],
  latest_status integer,
  healthy boolean
)
language sql
stable
set search_path = ''
as $$
  with queue as (
    select count(*) as queued, min(queued_at) as oldest from public.coach_media_deletions
  ),
  answers as (
    select r.status_code, r.created,
      coalesce(r.status_code between 200 and 299, false) as succeeded
    from public.coach_media_purge_requests p
    join net._http_response r on r.id = p.request_id
  ),
  latest as (
    select status_code, succeeded from answers order by created desc limit 1
  )
  select
    q.queued,
    floor(extract(epoch from now() - q.oldest) / 60)::integer,
    (select count(*) from answers),
    (select count(*) from answers where not succeeded),
    (select coalesce(array_agg(distinct coalesce(status_code, 0) order by coalesce(status_code, 0)), '{}')
       from answers where not succeeded),
    (select status_code from latest),
    coalesce(q.oldest >= now() - interval '1 hour', true)
      and coalesce((select succeeded from latest), true)
  from queue q;
$$;

revoke execute on function public.coach_media_purge_status()
  from public, anon, authenticated, service_role;
