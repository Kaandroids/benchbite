-- Deleting an account from the app takes a code sent to its email address, or its password (#438,
-- ADR 0095). Only the Edge Functions reach these tables, through the service role; no client can.

-- The code last sent to a user: only its hash is kept, so the table alone cannot delete anyone. It
-- goes with the user.
create table public.account_deletion_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code_hash bytea not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- What the limits count, per user: codes sent, wrong codes and passwords tried. They are counted
-- over time rather than per code, so that sending a new code gives no new tries.
create table public.account_deletion_tries (
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('code_sent', 'wrong_code', 'password')),
  created_at timestamptz not null default now()
);
create index on public.account_deletion_tries (user_id, kind, created_at);
create index on public.account_deletion_tries (kind, created_at);

-- When each user's password last changed. A session that signed in recently can set a new one
-- without the old (ADR 0093), so a password that new proves nothing about who asks.
create table public.password_changes (
  user_id uuid primary key references auth.users on delete cascade,
  changed_at timestamptz not null default now()
);

alter table public.account_deletion_codes enable row level security;
alter table public.account_deletion_tries enable row level security;
alter table public.password_changes enable row level security;
revoke all on public.account_deletion_codes, public.account_deletion_tries, public.password_changes
  from anon, authenticated;

create function public.record_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.password_changes (user_id) values (new.id)
  on conflict (user_id) do update set changed_at = now();
  return new;
end;
$$;

revoke execute on function public.record_password_change() from public, anon, authenticated;

create trigger record_password_change
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.record_password_change();

-- How many tries of a kind the user had since a time.
create function public.account_deletion_tries_since(p_user uuid, p_kind text, p_since timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(*) from public.account_deletion_tries
  where user_id = p_user and kind = p_kind and created_at > p_since;
$$;

-- Keeps a new code for the user in place of the one before: 'sent', or why not. A code can be sent
-- once a minute and 5 times an hour, so the app cannot flood the mailbox. It works for 15 minutes,
-- as the email in send-deletion-code says. The lock makes requests at the same moment wait their
-- turn, so they cannot all pass the counts.
create function public.new_account_deletion_code(p_user uuid, p_code_hash bytea)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account_deletion_tries ' || p_user::text, 0));
  if public.account_deletion_tries_since(p_user, 'code_sent', now() - interval '1 minute') > 0 then
    return 'too_soon';
  end if;
  if public.account_deletion_tries_since(p_user, 'code_sent', now() - interval '1 hour') >= 5 then
    return 'too_many';
  end if;

  insert into public.account_deletion_tries (user_id, kind) values (p_user, 'code_sent');
  insert into public.account_deletion_codes (user_id, code_hash, expires_at)
  values (p_user, p_code_hash, now() + interval '15 minutes')
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, sent_at = now(), expires_at = excluded.expires_at;
  return 'sent';
end;
$$;

-- Whether the code is the user's: 'right', 'wrong', 'expired' for one too old or never sent, or
-- 'too_many' after 5 wrong codes in an hour, whichever code they were for. That leaves a guess 5
-- tries an hour out of a million codes. Deleting the user removes the code with it; if deleting
-- fails, it works for another try.
create function public.check_account_deletion_code(p_user uuid, p_code_hash bytea)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.account_deletion_codes;
begin
  perform pg_advisory_xact_lock(hashtextextended('account_deletion_tries ' || p_user::text, 0));
  if public.account_deletion_tries_since(p_user, 'wrong_code', now() - interval '1 hour') >= 5 then
    return 'too_many';
  end if;
  select * into v_code from public.account_deletion_codes where user_id = p_user;
  if v_code is null or v_code.expires_at <= now() then
    return 'expired';
  end if;
  if v_code.code_hash = p_code_hash then
    return 'right';
  end if;
  insert into public.account_deletion_tries (user_id, kind) values (p_user, 'wrong_code');
  return 'wrong';
end;
$$;

-- Records a try of the user's password: 'allowed', or why not. A user gets 5 tries in 15 minutes.
-- Auth limits signing in per IP, and the function's IP is everyone's, so all users together get 20
-- in 5 minutes, below Auth's 30 (`sign_in_sign_ups` in config.toml), and are told to wait rather
-- than see Auth fail. A password that changed in the last day is refused.
create function public.take_account_deletion_password_try(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account_deletion_password_tries', 0));
  if exists (
    select from public.password_changes
    where user_id = p_user and changed_at > now() - interval '1 day'
  ) then
    return 'recently_changed';
  end if;
  if public.account_deletion_tries_since(p_user, 'password', now() - interval '15 minutes') >= 5 then
    return 'too_many';
  end if;
  if (
    select count(*) from public.account_deletion_tries
    where kind = 'password' and created_at > now() - interval '5 minutes'
  ) >= 20 then
    return 'busy';
  end if;
  insert into public.account_deletion_tries (user_id, kind) values (p_user, 'password');
  return 'allowed';
end;
$$;

-- What a day has made old, now with the codes and tries.
create or replace function public.remove_old_account_deletions()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.account_deletion_links where expires_at < now() - interval '1 day';
  delete from public.account_deletion_requests where created_at < now() - interval '1 day';
  delete from public.account_deletion_codes where expires_at < now() - interval '1 day';
  delete from public.account_deletion_tries where created_at < now() - interval '1 day';
$$;

revoke execute on function public.account_deletion_tries_since(uuid, text, timestamptz),
  public.new_account_deletion_code(uuid, bytea),
  public.check_account_deletion_code(uuid, bytea),
  public.take_account_deletion_password_try(uuid)
  from public, anon, authenticated;
grant execute on function public.new_account_deletion_code(uuid, bytea),
  public.check_account_deletion_code(uuid, bytea),
  public.take_account_deletion_password_try(uuid)
  to service_role;
