-- A code or link that confirms deleting an account goes to its address, but was kept by the user
-- alone. So one sent just before the address changed still worked for the rest of its time with
-- the old mailbox, which may no longer be the owner's (#563). Each now keeps the address it went
-- to, and works only while that is still the account's. Comparing when it is used needs no trigger
-- on the address and no lock while it is kept: whatever changed in between, the check sees it.

-- The codes and links waiting now went out before their address was kept; they last minutes, and
-- the user can ask again.
delete from public.account_deletion_codes;
delete from public.account_deletion_links;
alter table public.account_deletion_codes add column email text not null;
alter table public.account_deletion_links add column email text not null;

-- As before (ADR 0095), keeping the address the code is mailed to.
drop function public.new_account_deletion_code(uuid, bytea);

create function public.new_account_deletion_code(p_user uuid, p_code_hash bytea, p_email text)
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
  insert into public.account_deletion_codes (user_id, code_hash, email, expires_at)
  values (p_user, p_code_hash, p_email, now() + interval '15 minutes')
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, email = excluded.email, sent_at = now(),
      expires_at = excluded.expires_at;
  return 'sent';
end;
$$;

-- Only the send-deletion-code function calls it, with the service role (ADR 0126).
grant execute on function public.new_account_deletion_code(uuid, bytea, text) to service_role;

-- As before, with a code whose address is no longer the account's taken as expired.
create or replace function public.check_account_deletion_code(p_user uuid, p_code_hash bytea)
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
  if v_code is null or v_code.expires_at <= now() or not exists (
    select from auth.users where id = p_user and email = v_code.email
  ) then
    return 'expired';
  end if;
  if v_code.code_hash = p_code_hash then
    return 'right';
  end if;
  insert into public.account_deletion_tries (user_id, kind) values (p_user, 'wrong_code');
  return 'wrong';
end;
$$;

-- As before (#530), keeping the address the link is mailed to.
create or replace function public.start_account_deletion(
  p_email text,
  p_ip_hash bytea,
  p_token_hash bytea
)
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
    return null;
  end if;

  insert into public.account_deletion_requests (email_hash, ip_hash)
  values (v_email_hash, p_ip_hash);

  -- Auth keeps addresses in lower case, so the unique index finds it.
  select id, email into v_user, v_stored from auth.users
  where email = v_email and not is_sso_user and not is_anonymous and email_confirmed_at is not null;
  if v_user is null then
    return null;
  end if;

  insert into public.account_deletion_links (token_hash, user_id, email, expires_at)
  values (p_token_hash, v_user, v_stored, now() + interval '30 minutes');
  return v_stored;
end;
$$;


-- As before (ADR 0094), finding no user for a link whose address is no longer theirs.
create or replace function public.account_deletion_user(p_token_hash bytea)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select link.user_id from public.account_deletion_links link
  join auth.users on users.id = link.user_id and users.email = link.email
  where link.token_hash = p_token_hash and link.expires_at > now();
$$;
