-- Deleting an account from the website, with a link sent to its email address (#449, ADR 0094).
-- Only the Edge Functions reach these tables, through the service role; no client can.

-- A link sent to an account's address: only the hash of its token is kept, so the table alone
-- cannot delete anyone. It goes with the user.
create table public.account_deletion_links (
  token_hash bytea primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Every request for a link, to limit them per address and per IP, so the form cannot flood a
-- mailbox. Both are kept as hashes, and only for a day.
create table public.account_deletion_requests (
  email_hash bytea not null,
  ip_hash bytea not null,
  created_at timestamptz not null default now()
);
create index on public.account_deletion_requests (email_hash, created_at);
create index on public.account_deletion_requests (ip_hash, created_at);

alter table public.account_deletion_links enable row level security;
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_links, public.account_deletion_requests
  from anon, authenticated;

-- Records a request and, unless it came too often, makes a link for the account with this confirmed
-- address. Whether it made one is for the function only: the website answers the same either way.
-- An address gets 3 an hour from each IP and 10 from all, so others cannot use up its owner's; an IP
-- gets 10 an hour. Locks make requests for one address or IP wait their turn, so requests sent at
-- the same moment cannot all pass the counts.
create function public.start_account_deletion(
  p_email text,
  p_ip_hash bytea,
  p_token_hash bytea
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_email_hash bytea := extensions.digest(v_email, 'sha256');
  v_user uuid;
begin
  perform pg_advisory_xact_lock(1, hashtext(encode(v_email_hash, 'hex')));
  perform pg_advisory_xact_lock(2, hashtext(encode(p_ip_hash, 'hex')));

  if (
    select count(*) from public.account_deletion_requests
    where email_hash = v_email_hash and ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 3 or (
    select count(*) from public.account_deletion_requests
    where email_hash = v_email_hash and created_at > now() - interval '1 hour'
  ) >= 10 or (
    select count(*) from public.account_deletion_requests
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 10 then
    return false;
  end if;

  insert into public.account_deletion_requests (email_hash, ip_hash)
  values (v_email_hash, p_ip_hash);

  -- Auth keeps addresses in lower case, so the unique index finds it.
  select id into v_user from auth.users
  where email = v_email and not is_sso_user and not is_anonymous and email_confirmed_at is not null;
  if v_user is null then
    return false;
  end if;

  insert into public.account_deletion_links (token_hash, user_id, expires_at)
  values (p_token_hash, v_user, now() + interval '30 minutes');
  return true;
end;
$$;

-- The user a link deletes, while it still works. Deleting the user removes the link with it, so a
-- link works once; if deleting fails, the link still works for another try.
create function public.account_deletion_user(p_token_hash bytea)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.account_deletion_links
  where token_hash = p_token_hash and expires_at > now();
$$;

-- What a day has made old: links that no longer work, and requests the limits no longer count.
create function public.remove_old_account_deletions()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.account_deletion_links where expires_at < now() - interval '1 day';
  delete from public.account_deletion_requests where created_at < now() - interval '1 day';
$$;

revoke execute on function public.start_account_deletion(text, bytea, bytea),
  public.account_deletion_user(bytea), public.remove_old_account_deletions()
  from public, anon, authenticated;
grant execute on function public.start_account_deletion(text, bytea, bytea),
  public.account_deletion_user(bytea) to service_role;

select cron.schedule(
  'remove-old-account-deletions', '30 * * * *', 'select public.remove_old_account_deletions()'
);
