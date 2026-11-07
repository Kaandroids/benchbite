-- Links to delete an account from the website (#449, ADR 0094): made only for a confirmed account,
-- limited per address and per IP, working for 30 minutes, and out of every client's reach.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'unconfirmed@example.com', null, false);

select ok(
  public.start_account_deletion(' Kaan@Example.com ', '\x01', '\xaa'),
  'A confirmed account gets a link, whatever the case and spaces of its address'
);
select is(
  public.account_deletion_user('\xaa'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'The link names its account'
);
select ok(
  not public.start_account_deletion('unconfirmed@example.com', '\x01', '\xbb'),
  'An address nobody confirmed gets no link'
);
select ok(
  not public.start_account_deletion('nobody@example.com', '\x01', '\xcc'),
  'An address without an account gets no link'
);
select is(public.account_deletion_user('\xcc'), null, 'Nor does it have one');

select public.start_account_deletion('kaan@example.com', '\x02', '\xa1');
select public.start_account_deletion('kaan@example.com', '\x03', '\xa2');
select ok(
  not public.start_account_deletion('kaan@example.com', '\x04', '\xa3'),
  'An address asking a fourth time within an hour gets no link'
);
select is(public.account_deletion_user('\xa3'), null, 'The link it was refused does not work');

select public.start_account_deletion(
  'other' || n || '@example.com', '\x09', extensions.digest(n::text, 'sha256')
) from generate_series(1, 10) n;
select ok(
  not public.start_account_deletion('kaan2@example.com', '\x09', '\xd1'),
  'An IP asking an eleventh time within an hour gets nothing'
);

update public.account_deletion_links set expires_at = now() - interval '1 minute'
  where token_hash = '\xaa';
select is(public.account_deletion_user('\xaa'), null, 'A link no longer works after 30 minutes');

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select count(*)::int from public.account_deletion_links),
  0,
  'Deleting the account removes its links, so each works once'
);

select ok(
  not has_function_privilege('authenticated', 'public.start_account_deletion(text, bytea, bytea)', 'execute')
    and not has_function_privilege('anon', 'public.account_deletion_user(bytea)', 'execute'),
  'No client can make or read a link'
);
select ok(
  not has_table_privilege('anon', 'public.account_deletion_links', 'select')
    and not has_table_privilege('authenticated', 'public.account_deletion_requests', 'select'),
  'No client can read the tables'
);
select is(
  (select command from cron.job where jobname = 'remove-old-account-deletions'),
  'select public.remove_old_account_deletions()',
  'Old links and requests are removed every hour'
);

select * from finish();
rollback;
