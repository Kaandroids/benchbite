-- Codes and links that confirm deleting an account go when its address changes (#563), so a code
-- sent to the old mailbox cannot delete the account after it moved to a new one.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'other@example.com', now(), false);

insert into public.account_deletion_codes (user_id, code_hash, expires_at) values
  ('00000000-0000-0000-0000-00000000000a', '\xaa', now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000000b', '\xbb', now() + interval '15 minutes');
insert into public.account_deletion_links (token_hash, user_id, expires_at) values
  ('\xa1', '00000000-0000-0000-0000-00000000000a', now() + interval '30 minutes'),
  ('\xb1', '00000000-0000-0000-0000-00000000000b', now() + interval '30 minutes');

update auth.users set email = 'kaan@example.com', last_sign_in_at = now()
  where id = '00000000-0000-0000-0000-00000000000a';
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'right',
  'Another change of the user keeps their code'
);

update auth.users set email = 'kaan@new.example.com'
  where id = '00000000-0000-0000-0000-00000000000a';
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'expired',
  'A code sent before the address changed no longer deletes the account'
);
select is(
  public.account_deletion_user('\xa1'),
  null,
  'Nor does a link sent before'
);
select is(
  (select count(*)::int from public.account_deletion_codes
   where user_id = '00000000-0000-0000-0000-00000000000b')
    + (select count(*)::int from public.account_deletion_links
       where user_id = '00000000-0000-0000-0000-00000000000b'),
  2,
  'Other users keep theirs'
);

select * from finish();
rollback;
