-- A code or link that confirms deleting an account went to its address, but is kept by the user
-- alone. So one sent just before the address changed would still work for the rest of its time
-- with the old mailbox, which may no longer be the owner's (#563). When the address changes, the
-- codes and links waiting for it go; the new address can get new ones.
create function public.drop_account_deletion_proofs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.account_deletion_codes where user_id = new.id;
  delete from public.account_deletion_links where user_id = new.id;
  return new;
end;
$$;

create trigger drop_account_deletion_proofs
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.drop_account_deletion_proofs();

-- The trigger drops only the proofs already kept, so one kept just after the address changed, but
-- mailed to the address read before, would stay. Keeping a proof therefore holds the user's row for
-- share, which an address change waits for, and checks that the address it goes to is still the
-- account's; the trigger then finds the proof and drops it.

-- As before (ADR 0095), for the address the code is mailed to: 'address_changed' when it is no
-- longer the account's.
drop function public.new_account_deletion_code(uuid, bytea);

create function public.new_account_deletion_code(p_user uuid, p_code_hash bytea, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account_deletion_tries ' || p_user::text, 0));
  perform from auth.users where id = p_user and email = p_email for share;
  if not found then
    return 'address_changed';
  end if;
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

-- Only the send-deletion-code function calls it, with the service role (ADR 0126).
grant execute on function public.new_account_deletion_code(uuid, bytea, text) to service_role;

-- As before (#530), with the account's row held while its link is kept.
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

  -- Auth keeps addresses in lower case, so the unique index finds it. The row is held until the
  -- link is kept: an address change waits, and finds the link to drop.
  select id, email into v_user, v_stored from auth.users
  where email = v_email and not is_sso_user and not is_anonymous and email_confirmed_at is not null
  for share;
  if v_user is null then
    return null;
  end if;

  insert into public.account_deletion_links (token_hash, user_id, expires_at)
  values (p_token_hash, v_user, now() + interval '30 minutes');
  return v_stored;
end;
$$;

