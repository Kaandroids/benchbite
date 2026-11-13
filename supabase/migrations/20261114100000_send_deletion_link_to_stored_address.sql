-- The link to delete an account goes to the address the account has, not the one typed into the
-- website's form (#530). The two match with lower(), which folds some other characters into plain
-- ones: a Kelvin sign (U+212A) into "k". So "kaan@Kmail.com" typed with a Kelvin sign found the
-- account of kaan@kmail.com, while the link went to the typed address, another mailbox at a
-- domain anyone could register. start_account_deletion() now answers with the stored address, or
-- none when no link was made.
--
-- The rest is as before (ADR 0094): an address gets 3 requests an hour from each IP and 10 from
-- all, so others cannot use up its owner's; an IP gets 10 an hour. Locks make requests for one
-- address or IP wait their turn, so requests sent at the same moment cannot all pass the counts.
drop function public.start_account_deletion(text, bytea, bytea);

create function public.start_account_deletion(
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

  insert into public.account_deletion_links (token_hash, user_id, expires_at)
  values (p_token_hash, v_user, now() + interval '30 minutes');
  return v_stored;
end;
$$;

comment on function public.start_account_deletion(text, bytea, bytea) is
  'Records a request to delete an account and makes a link for it. Returns the address stored for '
  'the account, the one to send the link to, or null when no link was made.';

-- Only the request-account-deletion function calls it, with the service role (ADR 0126).
grant execute on function public.start_account_deletion(text, bytea, bytea) to service_role;
