-- Exports from storage (#712, ADR 0169): two an hour per user, taken only by the service role, and
-- the ZIPs of more than a day found for their purge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false);

select is(public.take_data_export('00000000-0000-0000-0000-00000000000a'), true, 'A first export is taken');
select is(public.take_data_export('00000000-0000-0000-0000-00000000000a'), true, 'and a second');
select is(public.take_data_export('00000000-0000-0000-0000-00000000000a'), false, 'but not a third in the hour');
select is(public.take_data_export('00000000-0000-0000-0000-00000000000b'), true, 'Another user has their own');

update public.data_export_runs set created_at = now() - interval '61 minutes'
  where user_id = '00000000-0000-0000-0000-00000000000a';
select is(public.take_data_export('00000000-0000-0000-0000-00000000000a'), true, 'An hour later there is one again');

select ok(
  not has_function_privilege('authenticated', 'public.take_data_export(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.take_data_export(uuid)', 'execute'),
  'Users cannot take exports themselves'
);
select ok(
  not has_table_privilege('authenticated', 'public.data_export_runs', 'select'),
  'nor read the runs'
);

insert into storage.objects (bucket_id, name, created_at) values
  ('data-exports', '00000000-0000-0000-0000-00000000000a/old.zip', now() - interval '25 hours'),
  ('data-exports', '00000000-0000-0000-0000-00000000000a/new.zip', now() - interval '1 hour'),
  ('coach-media', '00000000-0000-0000-0000-00000000000a/1/old.jpg', now() - interval '25 hours');
select results_eq(
  $$ select * from public.stale_data_exports(10) $$,
  $$ values ('00000000-0000-0000-0000-00000000000a/old.zip') $$,
  'Only exports of more than a day are purged'
);
select ok(
  not has_function_privilege('service_role', 'public.request_data_exports_purge()', 'execute'),
  'Only the scheduled job asks for the purge'
);

-- The link's user, as export_data_by_link() finds it, while it works and its address is the account's.
insert into public.data_export_links (user_id, email, token_hash, expires_at) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '\x01', now() + interval '30 minutes'),
  ('00000000-0000-0000-0000-00000000000b', 'old@example.com', '\x02', now() + interval '30 minutes'),
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '\x03', now() - interval '1 minute');
select is(
  public.data_export_link_user('\x01'), '00000000-0000-0000-0000-00000000000a'::uuid,
  'A working link names its user'
);
select ok(
  public.data_export_link_user('\x02') is null and public.data_export_link_user('\x03') is null,
  'A link to an address the account no longer has, or one run out, names none'
);

-- Withdrawing the health data consent asks to remove the user's export.
delete from vault.secrets where name in ('project_url', 'secret_key');
select vault.create_secret('http://functions.test', 'project_url');
select vault.create_secret('sb_secret_test', 'secret_key');
insert into public.health_data_consents (user_id, policy_version)
  values ('00000000-0000-0000-0000-00000000000b', '2026-10-21');
select public.withdraw_health_consent_of('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select convert_from(body, 'UTF8')::jsonb from net.http_request_queue
     where url = 'http://functions.test/functions/v1/purge-data-exports' $$,
  $$ values ('{"userId": "00000000-0000-0000-0000-00000000000b"}'::jsonb) $$,
  'Withdrawing the health data consent asks to remove the user''s export'
);

select * from finish();
rollback;
