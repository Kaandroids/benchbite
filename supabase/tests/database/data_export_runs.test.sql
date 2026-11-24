-- Exports from storage (#712, ADR 0169): two an hour per user, taken only by the service role, and
-- the ZIPs of more than a day found for their purge.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

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

select * from finish();
rollback;
