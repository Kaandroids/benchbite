-- The export's ZIP is written to storage and downloaded from there (#712, ADR 0169), so that a
-- large one is not cut off by the Edge Function's time limit as it downloads, and a user may make
-- two an hour.

-- The ZIPs being downloaded, one folder per user. Only the service role writes and reads it; the
-- user downloads through a signed link. A file is removed with the user's next export, or a day
-- after it was made.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('data-exports', 'data-exports', false, array['application/zip']);

-- The private buckets the export leaves out: data-exports holds the exports themselves.
create function public.export_left_out_buckets()
returns setof text
language sql
immutable
set search_path = ''
as $$
  values ('data-exports');
$$;

revoke execute on function public.export_left_out_buckets() from public, anon, authenticated;

-- When each user made an export, for the limit of two an hour.
create table public.data_export_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index data_export_runs_user_id_created_at_idx
  on public.data_export_runs (user_id, created_at);

-- Nobody reads or writes it but the functions below.
alter table public.data_export_runs enable row level security;
revoke all on public.data_export_runs from anon, authenticated;

-- Takes one of the user's two exports of the hour, or says none is left. The lock makes two
-- requests at the same moment wait for each other. Called by the export functions with the
-- service role, for the user they export: the signed-in one, or the link's account.
create function public.take_data_export(p_user uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('data_export:' || p_user::text, 0));
  if (
    select count(*) from public.data_export_runs r
    where r.user_id = p_user and r.created_at > now() - interval '1 hour'
  ) >= 2 then
    return false;
  end if;
  delete from public.data_export_runs r
    where r.user_id = p_user and r.created_at < now() - interval '1 day';
  insert into public.data_export_runs (user_id) values (p_user);
  return true;
end;
$$;

revoke execute on function public.take_data_export(uuid) from public, anon, authenticated;
grant execute on function public.take_data_export(uuid) to service_role;

-- As before (20261124140000), with the runs of the limit, which last an hour.
create or replace function public.export_left_out()
returns setof text
language sql
immutable
set search_path = ''
as $$
  values
    ('account_deletion_codes'), ('account_deletion_links'), ('account_deletion_tries'),
    ('consent_withdrawal_links'), ('data_export_links'), ('ai_calls_in_flight'),
    ('coach_media_deletions'), ('coach_stops'), ('removed_meal_entries'), ('data_export_runs');
$$;

-- The ZIPs made more than a day ago, which purge-data-exports removes, at most `p_limit` a run.
create function public.stale_data_exports(p_limit integer)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'data-exports' and o.created_at < now() - interval '1 day'
  order by o.created_at
  limit p_limit;
$$;

revoke execute on function public.stale_data_exports(integer) from public, anon, authenticated;
grant execute on function public.stale_data_exports(integer) to service_role;

-- Calls purge-data-exports while a ZIP is older than a day. Returns the pg_net request id, or null
-- when nothing was sent.
create function public.request_data_exports_purge()
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select from public.stale_data_exports(1)) then
    return null;
  end if;
  return public.call_scheduled_function('purge-data-exports');
end;
$$;

revoke execute on function public.request_data_exports_purge() from public, anon, authenticated, service_role;

select cron.schedule(
  'purge-data-exports',
  '40 * * * *',
  'select public.request_data_exports_purge()'
);
