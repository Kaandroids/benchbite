-- Codes and passwords that confirm deleting an account from the app (#438, ADR 0095, ADR 0127): a
-- code a minute and 5 an hour, working for 15 minutes, 5 wrong codes an hour whatever the code, no
-- password changed in the last day, and out of every client's reach.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'other@example.com', now(), false);

-- Moves the tries and codes back in time, as if minutes had passed.
create function pg_temp.later(p_minutes int) returns void language sql as $$
  update public.account_deletion_tries set created_at = created_at - make_interval(mins => p_minutes);
  update public.account_deletion_codes
    set sent_at = sent_at - make_interval(mins => p_minutes),
      expires_at = expires_at - make_interval(mins => p_minutes);
$$;
-- Its helpers are called as the signed-in user, while new functions are closed to clients
-- (#529, ADR 0126): only they are opened, and go with the test's session.
grant execute on all functions in schema pg_temp to public;

select is(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'sent',
  'A user gets a code'
);
select is(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xbb'),
  'too_soon',
  'Not a second one within a minute'
);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'right',
  'The code is right, and the refused one did not replace it'
);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000b', '\xaa'),
  'expired',
  'It is no other user''s, who has none'
);

select pg_temp.later(2);
select is(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xcc'),
  'sent',
  'A minute later a new code is sent'
);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xaa'),
  'wrong',
  'And the one before no longer works'
);

select public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\x01')
  from generate_series(1, 4);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xcc'),
  'too_many',
  'After 5 wrong codes, the right one no longer works either'
);
select pg_temp.later(2);
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xdd');
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xdd'),
  'too_many',
  'Nor does a new code bring new tries'
);
select pg_temp.later(61);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xdd'),
  'expired',
  'An hour later the tries are back, and the code has expired after 15 minutes'
);

select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe1');
select pg_temp.later(2);
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe2');
select pg_temp.later(2);
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe3');
select pg_temp.later(2);
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe4');
select pg_temp.later(2);
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe5');
select pg_temp.later(2);
select is(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe6'),
  'too_many',
  'A sixth code within an hour is not sent'
);
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xe5'),
  'right',
  'And the last one sent still works'
);

select pg_temp.later(61);
select public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xf1');
select public.take_back_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xf1');
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xf1'),
  'expired',
  'A code taken back, as its email failed, does not work'
);
select is(
  public.new_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xf2'),
  'sent',
  'And another can be sent at once'
);
select public.take_back_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xf1');
select is(
  public.check_account_deletion_code('00000000-0000-0000-0000-00000000000a', '\xf2'),
  'right',
  'Taking back an older code leaves the newer one'
);

select is(
  public.password_changed_lately('00000000-0000-0000-0000-00000000000b'),
  false,
  'A password not changed lately can confirm'
);
update auth.users set encrypted_password = 'new' where id = '00000000-0000-0000-0000-00000000000b';
select ok(
  exists (select from public.password_changes
          where user_id = '00000000-0000-0000-0000-00000000000b'),
  'A change of password is recorded'
);
select is(
  public.password_changed_lately('00000000-0000-0000-0000-00000000000b'),
  true,
  'A password changed within a day cannot'
);
select is(
  public.password_changed_lately('00000000-0000-0000-0000-00000000000a'),
  false,
  'Another user''s change does not count'
);
update public.password_changes set changed_at = now() - interval '25 hours';
select is(
  public.password_changed_lately('00000000-0000-0000-0000-00000000000b'),
  false,
  'A day later it can'
);

insert into public.account_deletion_tries (user_id, kind)
  values ('00000000-0000-0000-0000-00000000000b', 'code_sent');
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select is(
  (select count(*)::int from public.account_deletion_tries
   where user_id = '00000000-0000-0000-0000-00000000000b')
    + (select count(*)::int from public.password_changes
       where user_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'Deleting the account removes its tries and password change'
);

select ok(
  not has_function_privilege('authenticated', 'public.check_account_deletion_code(uuid, bytea)', 'execute')
    and not has_function_privilege('authenticated', 'public.new_account_deletion_code(uuid, bytea)', 'execute')
    and not has_function_privilege('anon', 'public.password_changed_lately(uuid)', 'execute'),
  'No client can make or check a code, or ask about a password'
);
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_codes', 'select')
    and not has_table_privilege('anon', 'public.account_deletion_tries', 'select')
    and not has_table_privilege('authenticated', 'public.password_changes', 'select'),
  'No client can read the tables'
);

select * from finish();
rollback;
