-- A sign-up nobody confirmed is removed after a day, as it holds its address (ADR 0091).
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, email_confirmed_at, last_sign_in_at, is_anonymous, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'old@example.com', null, null, false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000000b', 'recent@example.com', null, null, false, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000000c', 'confirmed@example.com', now(), null, false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000000d', null, null, null, true, now() - interval '2 days');

select public.remove_unconfirmed_users();

select results_eq(
  $$ select id from auth.users
     where id between '00000000-0000-0000-0000-00000000000a' and '00000000-0000-0000-0000-00000000000d'
     order by id $$,
  $$ values ('00000000-0000-0000-0000-00000000000b'::uuid),
            ('00000000-0000-0000-0000-00000000000c'::uuid),
            ('00000000-0000-0000-0000-00000000000d'::uuid) $$,
  'Only a sign-up that is old and unconfirmed is removed, not a guest'
);

select is(
  (select command from cron.job where jobname = 'remove-unconfirmed-users'),
  'select public.remove_unconfirmed_users()',
  'The sign-ups are removed every hour'
);

select is(
  (select schedule from cron.job where jobname = 'remove-unconfirmed-users'),
  '0 * * * *',
  'The job runs at the start of the hour'
);

select ok(
  not has_function_privilege('authenticated', 'public.remove_unconfirmed_users()', 'execute'),
  'A user cannot call it'
);

select * from finish();
rollback;
