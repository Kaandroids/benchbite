-- Codes and password tries that confirm deleting an account from the app (#438, ADR 0095): a code
-- a minute, working for 15 minutes and 5 wrong tries, 5 password tries in 15 minutes, and out of
-- every client's reach.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'other@example.com', now(), false);

select ok(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'A user gets a code'
);
select ok(
  not public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xbb'),
  'Not a second one within a minute'
);
select ok(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'The code is right, and the refused one did not replace it'
);
select ok(
  not public.check_account_deletion_code('00000000-0000-0000-0000-00000000000b', '\xaa'),
  'It is no other user''s'
);

update public.account_deletion_codes set sent_at = now() - interval '61 seconds';
select ok(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xcc'),
  'A minute later a new code is sent'
);
select ok(
  not public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'And the one before no longer works'
);

select public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\x01')
  from generate_series(1, 4);
select ok(
  not public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xcc'),
  'After 5 wrong tries, the right code no longer works either'
);

update public.account_deletion_codes set sent_at = now() - interval '61 seconds';
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xdd');
select ok(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xdd'),
  'A new code starts with all its tries'
);
update public.account_deletion_codes set expires_at = now() - interval '1 second';
select ok(
  not public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xdd'),
  'A code no longer works after 15 minutes'
);

select public.take_account_deletion_password_try('00000000-0000-0000-0000-00000000000a')
  from generate_series(1, 5);
select ok(
  not public.take_account_deletion_password_try('00000000-0000-0000-0000-00000000000a'),
  'A sixth password try within 15 minutes is refused'
);
select ok(
  public.take_account_deletion_password_try('00000000-0000-0000-0000-00000000000b'),
  'Other users keep theirs'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select count(*)::int from public.account_deletion_codes
   where user_id = '00000000-0000-0000-0000-00000000000a')
    + (select count(*)::int from public.account_deletion_password_tries
       where user_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'Deleting the account removes its code and tries'
);

select ok(
  not has_function_privilege('authenticated', 'public.check_account_deletion_code(uuid, bytea)', 'execute')
    and not has_function_privilege('authenticated', 'public.new_account_deletion_code(uuid, bytea)', 'execute')
    and not has_function_privilege('anon', 'public.take_account_deletion_password_try(uuid)', 'execute'),
  'No client can make or check a code'
);
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_codes', 'select')
    and not has_table_privilege('anon', 'public.account_deletion_password_tries', 'select'),
  'No client can read the tables'
);

select * from finish();
rollback;
