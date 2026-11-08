-- A code to delete an account whose email could not be sent (#438, ADR 0095): it is taken back,
-- and does not count against the codes a user can be sent, so trying again sends one at once.

-- Removes the code, if it is still this one, and the send counted for it, the latest.
create function public.take_back_account_deletion_code(p_user uuid, p_code_hash bytea)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('account_deletion_tries ' || p_user::text, 0));
  delete from public.account_deletion_codes where user_id = p_user and code_hash = p_code_hash;
  if found then
    delete from public.account_deletion_tries
    where ctid = (
      select ctid from public.account_deletion_tries
      where user_id = p_user and kind = 'code_sent'
      order by created_at desc
      limit 1
    );
  end if;
end;
$$;

revoke execute on function public.take_back_account_deletion_code(uuid, bytea)
  from public, anon, authenticated;
grant execute on function public.take_back_account_deletion_code(uuid, bytea) to service_role;
