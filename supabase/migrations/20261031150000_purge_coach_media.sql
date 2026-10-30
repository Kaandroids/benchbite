-- Removes the photos of a deleted chat from the coach-media bucket (#361, ADR 0063). Storage
-- objects can only be removed through the Storage API, so deleting a thread queues its folder,
-- and a scheduled job calls the purge-coach-media function, which empties the queued folders with
-- the service role. Deleting an account deletes its threads, so the same queue covers it.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The folders of deleted threads, "<user id>/<thread id>/", until their photos are removed. Only
-- the trigger below writes it and only the purge function reads it, with the service role, so
-- clients have no grants and no policies.
create table public.coach_media_deletions (
  thread_id bigint primary key,
  -- No foreign key: the user may be deleted with the thread.
  user_id uuid not null,
  queued_at timestamptz not null default now(),
  -- Failed runs, so that a folder that keeps failing goes to the end of the next batch.
  attempts integer not null default 0 check (attempts >= 0)
);

alter table public.coach_media_deletions enable row level security;
revoke all on public.coach_media_deletions from anon, authenticated;

create index coach_media_deletions_batch_idx
  on public.coach_media_deletions (attempts, queued_at);

comment on table public.coach_media_deletions is
  'Folders of deleted chat threads in coach-media, until purge-coach-media removes their photos.';

-- One statement deletes all threads of an account, so the trigger queues them in one insert.
create function public.queue_coach_media_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.coach_media_deletions (thread_id, user_id)
  select d.id, d.user_id from deleted d
  on conflict (thread_id) do nothing;
  return null;
end;
$$;

revoke execute on function public.queue_coach_media_deletion() from public, anon, authenticated;

create trigger coach_threads_queue_media_deletion
  after delete on public.coach_threads
  referencing old table as deleted
  for each statement execute function public.queue_coach_media_deletion();

-- Calls purge-coach-media when folders are queued, as Supabase schedules Edge Functions: the
-- project URL and a secret API key are read from Vault when the job runs, so that no key is kept
-- in the migrations. Without them the call is skipped with a warning. Returns the pg_net request
-- id, or null when nothing was sent.
create function public.request_coach_media_purge()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  project_url text;
  secret_key text;
begin
  if not exists (select 1 from public.coach_media_deletions) then
    return null;
  end if;

  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret_key from vault.decrypted_secrets where name = 'secret_key';
  if project_url is null or secret_key is null then
    raise warning 'purge-coach-media is not called: set project_url and secret_key in Vault';
    return null;
  end if;

  return net.http_post(
    url := project_url || '/functions/v1/purge-coach-media',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', secret_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.request_coach_media_purge()
  from public, anon, authenticated, service_role;

select cron.schedule(
  'purge-coach-media',
  '*/5 * * * *',
  'select public.request_coach_media_purge()'
);
