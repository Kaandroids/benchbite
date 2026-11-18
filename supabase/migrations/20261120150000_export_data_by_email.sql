-- Exporting a user's data from the website, with a link sent to the account's email address
-- (#553, ADR 0148), as an account is deleted (ADR 0094) and a consent withdrawn (ADR 0146) there.
-- Only the Edge Functions reach these tables and functions, through the service role; no client
-- can.

-- A link sent to an account's address to download its export: only the hash of its token is kept,
-- with the address it went to, so it works only while that is still the account's (#563). Unlike
-- the other links it works more than once while it lasts, as a download can fail without the
-- server knowing.
create table public.data_export_links (
  token_hash bytea primary key,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index on public.data_export_links (user_id);

-- Every request for a link, to limit them per address and per IP, as hashes and for a day.
create table public.data_export_requests (
  email_hash bytea not null,
  ip_hash bytea not null,
  created_at timestamptz not null default now()
);
create index on public.data_export_requests (email_hash, created_at);
create index on public.data_export_requests (ip_hash, created_at);

alter table public.data_export_links enable row level security;
alter table public.data_export_requests enable row level security;
revoke all on public.data_export_links, public.data_export_requests from anon, authenticated;

-- Records a request and, unless it came too often, makes a link for the account with this
-- confirmed address, with the limits of start_account_deletion(): 3 an hour for an address from
-- each IP and 10 from all, 10 an hour for an IP. Returns the address stored for the account, the
-- one to send the link to, or null when no link was made.
create function public.start_data_export(p_email text, p_ip_hash bytea, p_token_hash bytea)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_email_hash bytea := extensions.digest(v_email, 'sha256');
  v_user uuid;
  v_stored text;
begin
  perform pg_advisory_xact_lock(5, hashtext(encode(v_email_hash, 'hex')));
  perform pg_advisory_xact_lock(6, hashtext(encode(p_ip_hash, 'hex')));

  if (
    select count(*) from public.data_export_requests
    where email_hash = v_email_hash and ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 3 or (
    select count(*) from public.data_export_requests
    where email_hash = v_email_hash and created_at > now() - interval '1 hour'
  ) >= 10 or (
    select count(*) from public.data_export_requests
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 10 then
    return null;
  end if;

  insert into public.data_export_requests (email_hash, ip_hash) values (v_email_hash, p_ip_hash);

  -- Auth keeps addresses in lower case, so the unique index finds it.
  select id, email into v_user, v_stored from auth.users
  where email = v_email and not is_sso_user and not is_anonymous and email_confirmed_at is not null;
  if v_user is null then
    return null;
  end if;

  insert into public.data_export_links (token_hash, user_id, email, expires_at)
  values (p_token_hash, v_user, v_stored, now() + interval '30 minutes');
  return v_stored;
end;
$$;

-- The export of the account a link belongs to, as the app's (ADR 0147), while the link works and
-- its address is still the account's; null for a link that does not work.
create function public.export_data_by_link(p_token_hash bytea)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select link.user_id into v_user from public.data_export_links link
  join auth.users on users.id = link.user_id and users.email = link.email
  where link.token_hash = p_token_hash and link.expires_at > now();
  if v_user is null then
    return null;
  end if;
  return public.export_user_data(v_user);
end;
$$;

-- What a day has made old: links that no longer work, and requests the limits no longer count.
create function public.remove_old_data_exports()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.data_export_links where expires_at < now() - interval '1 day';
  delete from public.data_export_requests where created_at < now() - interval '1 day';
$$;

-- Only request-data-export and download-data-export call them, with the service role
-- (ADR 0126); the clean-up only pg_cron.
revoke execute on function public.start_data_export(text, bytea, bytea),
  public.export_data_by_link(bytea), public.remove_old_data_exports()
  from public, anon, authenticated;
grant execute on function public.start_data_export(text, bytea, bytea),
  public.export_data_by_link(bytea) to service_role;

select cron.schedule(
  'remove-old-data-exports', '50 * * * *', 'select public.remove_old_data_exports()'
);

-- The export leaves out the links and requests, as those of the other links (ADR 0147).
create or replace function public.export_left_out()
returns setof text
language sql
immutable
set search_path = ''
as $$
  values
    ('account_deletion_codes'), ('account_deletion_links'), ('account_deletion_tries'),
    ('consent_withdrawal_links'), ('data_export_links'), ('ai_calls_in_flight'),
    ('coach_media_deletions'), ('coach_stops'), ('removed_meal_entries'), ('ai_usage');
$$;
