-- Links to export a user's data from the website (#553, ADR 0148): made only for a confirmed
-- account and limited as the other links, they give the app's export, work for 30 minutes and
-- more than once, only while their address is the account's, and are out of every client's reach.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'kaan@example.com', now(), false),
  ('00000000-0000-0000-0000-00000000000b', 'unconfirmed@example.com', null, false);
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 70, current_date);

-- As the Edge Functions call, with the service role and no user.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.start_data_export(' Kaan@Example.com ', '\x01', '\xa1'),
  'kaan@example.com',
  'A confirmed account gets a link, sent to its own address'
);
select is(
  public.start_data_export('unconfirmed@example.com', '\x01', '\xb1'),
  null,
  'An address nobody confirmed gets no link'
);
select is(
  public.start_data_export('nobody@example.com', '\x01', '\xc1'),
  null,
  'An address without an account gets no link'
);

select is(
  public.export_data_by_link('\xa1'),
  public.export_user_data('00000000-0000-0000-0000-00000000000a')
    || jsonb_build_object('exported_at', public.export_data_by_link('\xa1')->'exported_at'),
  'A link gives the app''s export of its account'
);
select isnt(public.export_data_by_link('\xa1'), null, 'And works again, for a download that failed');
select is(public.export_data_by_link('\xc1'), null, 'A link nobody made gives nothing');

update public.data_export_links set expires_at = now() - interval '1 second'
  where token_hash = '\xa1';
select is(public.export_data_by_link('\xa1'), null, 'An old link gives nothing');

select public.start_data_export('kaan@example.com', '\x01', '\xa2');
update auth.users set email = 'new@example.com' where id = '00000000-0000-0000-0000-00000000000a';
select is(
  public.export_data_by_link('\xa2'),
  null,
  'Nor one whose address is no longer the account''s'
);
update auth.users set email = 'kaan@example.com' where id = '00000000-0000-0000-0000-00000000000a';
select public.start_data_export('kaan@example.com', '\x01', '\xa4');

select is(
  public.start_data_export('kaan@example.com', '\x01', '\xa3'),
  null,
  'An address asking a fourth time from one IP within an hour gets no link'
);

select ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated']) r,
      unnest(array[
        'public.start_data_export(text, bytea, bytea)', 'public.export_data_by_link(bytea)',
        'public.remove_old_data_exports()'
      ]) f
    where has_function_privilege(r, f, 'execute')
  ) and not exists (
    select 1 from unnest(array['anon', 'authenticated']) r,
      unnest(array['public.data_export_links', 'public.data_export_requests']) t,
      unnest(array['select', 'insert']) p
    where has_table_privilege(r, t, p)
  ),
  'No client, signed in or not, can make, use or read a link'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok(
  $$ select public.export_data_by_link('\xa2') $$,
  '42501',
  null,
  'A user cannot use a link from the app'
);
select throws_ok(
  $$ select * from public.data_export_links $$,
  '42501',
  null,
  'Nor read the links'
);

select * from finish();
rollback;
