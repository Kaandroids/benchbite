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

-- The user a working export link is for, by its hash, as export_data_by_link() finds it, so that
-- download-data-export takes the limit before it builds the export. Only the function calls it.
create function public.data_export_link_user(p_token_hash bytea)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select link.user_id from public.data_export_links link
  join auth.users on users.id = link.user_id and users.email = link.email
  where link.token_hash = p_token_hash and link.expires_at > now();
$$;

revoke execute on function public.data_export_link_user(bytea) from public, anon, authenticated;
grant execute on function public.data_export_link_user(bytea) to service_role;

-- As before (20261123160000), and the user's export, which holds the health data the withdrawal
-- deletes, is removed too.
create or replace function public.withdraw_health_consent_of(user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  owner_id uuid := withdraw_health_consent_of.user_id;
begin
  -- In the order other writes take them, the limits first (save_workout()), so that the two never
  -- wait for each other. After a write being made now, which this then deletes, or before it,
  -- which is then refused.
  perform public.lock_user_limits(owner_id);
  perform public.lock_health_consent(owner_id);
  if not public.has_health_consent(owner_id) then
    raise exception 'There is no health data consent to withdraw' using errcode = 'BB062';
  end if;

  perform public.end_ai_consent(owner_id);
  -- Reading the store rests on this consent too: it ends with it.
  perform public.end_health_app_consent(owner_id);
  -- And the export of the data it held, removed once this commits (ADR 0169). A request that cannot
  -- be sent is only warned of, so that it never stops the withdrawal; the daily purge catches it.
  begin
    perform public.call_scheduled_function(
      'purge-data-exports', jsonb_build_object('userId', owner_id), 10000
    );
  exception when others then
    raise warning 'purge-data-exports is not called: %', sqlerrm;
  end;

  delete from public.meal_entries m where m.user_id = owner_id;
  -- After the meals, whose delete records them here.
  delete from public.removed_meal_entries r where r.user_id = owner_id;
  delete from public.water_days w where w.user_id = owner_id;
  delete from public.step_days s where s.user_id = owner_id;

  delete from public.workout_logs l where l.user_id = owner_id;
  delete from public.outside_workouts o where o.user_id = owner_id;
  delete from public.workout_moves m where m.user_id = owner_id;
  delete from public.workouts w where w.user_id = owner_id;
  delete from public.planned_days_kept k where k.user_id = owner_id;
  delete from public.planned_days d where d.user_id = owner_id;
  delete from public.applied_plans a where a.user_id = owner_id;

  delete from public.day_nutrition_targets d where d.user_id = owner_id;
  delete from public.own_nutrition_targets o where o.user_id = owner_id;
  delete from public.streak_days s where s.user_id = owner_id;
  delete from public.user_streaks s where s.user_id = owner_id;
  delete from public.weight_entries w where w.user_id = owner_id;
  delete from public.goals g where g.user_id = owner_id;
  delete from public.profiles p where p.user_id = owner_id;

  -- Last, as deleting workouts writes their planned days, which the withdrawal would refuse.
  insert into public.health_data_consent_withdrawals (user_id) values (owner_id);
end;
$$;
