-- Links to delete an account from the website (#449, ADR 0094): made only for a confirmed account,
-- limited per address and per IP, working for 30 minutes, and out of every client's reach.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'unconfirmed@example.com', null, false),
  ('00000000-0000-0000-0000-00000000000c', 'kelvin@example.com', now(), false);

select is(
  public.start_account_deletion(' Kaan@Example.com ', '\x01', '\xaa'),
  'kaan@example.com',
  'A confirmed account gets a link, whatever the case and spaces of its address, sent to its own address'
);
select is(
  public.account_deletion_user('\xaa'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'The link names its account'
);
select is(
  public.start_account_deletion('unconfirmed@example.com', '\x01', '\xbb'),
  null,
  'An address nobody confirmed gets no link'
);
select is(
  public.start_account_deletion('nobody@example.com', '\x01', '\xcc'),
  null,
  'An address without an account gets no link'
);
select is(public.account_deletion_user('\xcc'), null, 'Nor does it have one');

select public.start_account_deletion('kaan@example.com', '\x01', '\xa1');
select public.start_account_deletion('kaan@example.com', '\x01', '\xa2');
select is(
  public.start_account_deletion('kaan@example.com', '\x01', '\xa3'),
  null,
  'An address asking a fourth time from one IP within an hour gets no link'
);
select is(public.account_deletion_user('\xa3'), null, 'The link it was refused does not work');
select isnt(
  public.start_account_deletion('kaan@example.com', '\x05', '\xa4'),
  null,
  'Its owner, from another IP, still gets one'
);
select public.start_account_deletion('kaan@example.com', ('\x1' || n)::bytea, ('\xb' || n)::bytea)
  from generate_series(0, 5) n;
select is(
  public.start_account_deletion('kaan@example.com', '\x07', '\xa5'),
  null,
  'An address gets no more than 10 an hour from all IPs'
);

select public.start_account_deletion(
  'other' || n || '@example.com', '\x09', extensions.digest(n::text, 'sha256')
) from generate_series(1, 10) n;
select is(
  public.start_account_deletion('kaan2@example.com', '\x09', '\xd1'),
  null,
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

-- A Kelvin sign (U+212A) folds into "k" with lower(): the address typed with one finds the account,
-- and the link goes to the address the account has, not the typed one (#530).
select is(
  public.start_account_deletion(U&'\212Aelvin@example.com', '\x0b', '\xe1'),
  'kelvin@example.com',
  'A look-alike spelling of an address gets the link sent to the stored address'
);

select * from finish();
rollback;
