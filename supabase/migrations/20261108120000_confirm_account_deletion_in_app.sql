-- Deleting an account from the app takes a code sent to its email address, or its password (#438,
-- ADR 0095). Only the Edge Functions reach these tables, through the service role; no client can.

-- The code last sent to a user: only its hash is kept, so the table alone cannot delete anyone. It
-- goes with the user.
create table public.account_deletion_codes (
  user_id uuid primary key references auth.users on delete cascade,
  code_hash bytea not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  failed_tries smallint not null default 0
);

-- Every try of a password to delete an account, to limit them per user: Auth limits signing in per
-- IP, and the function's IP is the same for everyone.
create table public.account_deletion_password_tries (
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index on public.account_deletion_password_tries (user_id, created_at);

alter table public.account_deletion_codes enable row level security;
alter table public.account_deletion_password_tries enable row level security;
revoke all on public.account_deletion_codes, public.account_deletion_password_tries
  from anon, authenticated;

-- Keeps a new code for the user, working for 15 minutes, in place of the one before; false when the
-- last was sent less than a minute ago, so the app cannot flood the mailbox.
create function public.new_account_deletion_code(p_user uuid, p_code_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_deletion_codes (user_id, code_hash, expires_at)
  values (p_user, p_code_hash, now() + interval '15 minutes')
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, sent_at = now(), expires_at = excluded.expires_at,
      failed_tries = 0
    where public.account_deletion_codes.sent_at <= now() - interval '1 minute';
  return found;
end;
$$;

-- Whether the code is the user's, while it works. A wrong code counts against it, and after 5 the
-- code no longer works, so it cannot be guessed. The row lock makes tries at the same moment wait
-- their turn. Deleting the user removes the code with it; if deleting fails, it works for another
-- try.
create function public.check_account_deletion_code(p_user uuid, p_code_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.account_deletion_codes;
begin
  select * into v_code from public.account_deletion_codes where user_id = p_user for update;
  if v_code is null or v_code.expires_at <= now() or v_code.failed_tries >= 5 then
    return false;
  end if;
  if v_code.code_hash = p_code_hash then
    return true;
  end if;
  update public.account_deletion_codes set failed_tries = failed_tries + 1 where user_id = p_user;
  return false;
end;
$$;

-- Records a try of the user's password, unless they have had 5 in the last 15 minutes. The lock
-- makes tries at the same moment wait their turn, so they cannot all pass the count.
create function public.take_account_deletion_password_try(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(3, hashtext(p_user::text));
  if (
    select count(*) from public.account_deletion_password_tries
    where user_id = p_user and created_at > now() - interval '15 minutes'
  ) >= 5 then
    return false;
  end if;
  insert into public.account_deletion_password_tries (user_id) values (p_user);
  return true;
end;
$$;

-- What a day has made old, now with the codes and password tries.
create or replace function public.remove_old_account_deletions()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.account_deletion_links where expires_at < now() - interval '1 day';
  delete from public.account_deletion_requests where created_at < now() - interval '1 day';
  delete from public.account_deletion_codes where expires_at < now() - interval '1 day';
  delete from public.account_deletion_password_tries where created_at < now() - interval '1 day';
$$;

revoke execute on function public.new_account_deletion_code(uuid, bytea),
  public.check_account_deletion_code(uuid, bytea),
  public.take_account_deletion_password_try(uuid)
  from public, anon, authenticated;
grant execute on function public.new_account_deletion_code(uuid, bytea),
  public.check_account_deletion_code(uuid, bytea),
  public.take_account_deletion_password_try(uuid)
  to service_role;
