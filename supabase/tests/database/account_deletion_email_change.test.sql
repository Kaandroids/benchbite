-- A code or link that confirms deleting an account works only while the address it went to is still
-- the account's (#563), so one sent to the old mailbox cannot delete the account after it moved.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'other@example.com', now(), false);

select public.new_account_deletion_code(
  '00000000-0000-0000-0000-00000000000a', '\xaa', 'kaan@example.com'
);
select public.new_account_deletion_code(
  '00000000-0000-0000-0000-00000000000b', '\xbb', 'other@example.com'
);
select public.start_account_deletion('kaan@example.com', '\x01', '\xa1');
select public.start_account_deletion('other@example.com', '\x01', '\xb1');

update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-00000000000a';
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'right',
  'Another change of the user keeps their code working'
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

-- As when the address changes while the code is being kept: it went to the old address.
delete from public.account_deletion_tries;
select public.new_account_deletion_code(
  '00000000-0000-0000-0000-00000000000a', '\xac', 'kaan@example.com'
);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xac'),
  'expired',
  'Nor a code kept for the old address after it changed'
);
select is(
  public.start_account_deletion('kaan@example.com', '\x02', '\xa2'),
  null,
  'The old address gets no new link'
);

delete from public.account_deletion_tries;
select public.new_account_deletion_code(
  '00000000-0000-0000-0000-00000000000a', '\xad', 'kaan@new.example.com'
);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xad'),
  'right',
  'A code sent to the new address works'
);

select ok(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000b', '\xbb') = 'right'
    and public.account_deletion_user('\xb1') = '00000000-0000-0000-0000-00000000000b',
  'Other users keep theirs'
);

select * from finish();
rollback;
