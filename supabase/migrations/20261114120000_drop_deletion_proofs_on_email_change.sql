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
