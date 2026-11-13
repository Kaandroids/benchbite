-- Guests inactive for 90 days are found for remove-inactive-guests, which a scheduled call reaches
-- with the URL and key from Vault (ADR 0131). A sign-in or a refreshed session counts as activity,
-- and accounts are left alone.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- A: a guest last seen 100 days ago. B: the same, but its session was refreshed yesterday.
-- C: a guest created yesterday. D: an account inactive for 100 days. E: a guest that signed in
-- 89 days ago and has no session left.
insert into auth.users (id, email, is_anonymous, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-00000000000a', null, true, now() - interval '100 days', now() - interval '100 days'),
  ('00000000-0000-0000-0000-00000000000b', null, true, now() - interval '100 days', now() - interval '100 days'),
  ('00000000-0000-0000-0000-00000000000c', null, true, now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com', false, now() - interval '100 days', now() - interval '100 days'),
  ('00000000-0000-0000-0000-00000000000e', null, true, now() - interval '200 days', now() - interval '89 days');

insert into auth.sessions (id, user_id, created_at, updated_at) values
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', now() - interval '100 days', now() - interval '95 days'),
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', now() - interval '100 days', now() - interval '1 day');

select is(
  public.last_active_at('00000000-0000-0000-0000-00000000000a'),
  now() - interval '95 days',
  'A session''s last refresh is the last activity when it is later than the sign-in'
);

select results_eq(
  $$ select g from public.inactive_guests(10) g order by 1 $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'Only guests inactive for 90 days are found, not those refreshed, signed in lately, or accounts'
);

select is(
  (select count(*) from public.inactive_guests(0)),
  0::bigint,
  'No more guests than asked for are found'
);

select ok(
  not bool_or(has_function_privilege(role, 'public.inactive_guests(integer)', 'execute')),
  'Clients cannot list inactive guests'
)
from (values ('anon'), ('authenticated')) roles (role);

select ok(
  has_function_privilege('service_role', 'public.inactive_guests(integer)', 'execute'),
  'remove-inactive-guests can list inactive guests'
);

select ok(
  not bool_or(has_function_privilege(role, 'public.' || fn, 'execute')),
  'No client calls ' || fn
)
from (values ('anon'), ('authenticated'), ('service_role')) roles (role)
cross join (values
  ('last_active_at(uuid)'),
  ('inactive_guest_removal_stalled()'),
  ('call_scheduled_function(text)')
) fns (fn)
group by fn
order by fn;

select ok(
  not bool_or(has_function_privilege(role, 'public.request_inactive_guest_removal()', 'execute')),
  'Only the scheduled job calls remove-inactive-guests'
)
from (values ('anon'), ('authenticated'), ('service_role')) roles (role);

-- A at 100 days is past the period by more than a day, which only a removal that keeps failing or
-- falls far behind leaves; at 91 days less a minute it is not yet.
select ok(public.inactive_guest_removal_stalled(), 'A guest a day past the period means it stalled');
update auth.sessions set updated_at = now() - interval '91 days' + interval '1 minute'
  where user_id = '00000000-0000-0000-0000-00000000000a';
select ok(
  not public.inactive_guest_removal_stalled(),
  'A guest within a day of the period is no sign that it stalled'
);

-- Without the Vault secrets nothing is sent, and with them the function is called with the key.
delete from vault.secrets where name in ('project_url', 'secret_key');
select is(
  public.request_inactive_guest_removal(), null, 'Nothing is called without the Vault secrets'
);

select vault.create_secret('http://functions.test', 'project_url');
select vault.create_secret('sb_secret_test', 'secret_key');
select isnt(
  public.request_inactive_guest_removal(), null,
  'With an inactive guest, remove-inactive-guests is called'
);
select results_eq(
  $$ select url, headers ->> 'apikey' from net.http_request_queue
     where url like 'http://functions.test/%' $$,
  $$ values ('http://functions.test/functions/v1/remove-inactive-guests', 'sb_secret_test') $$,
  'The call takes the URL and the secret key from Vault'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is(
  public.request_inactive_guest_removal(), null, 'Nothing is called while no guest is inactive'
);

select is(
  (select schedule from cron.job where jobname = 'remove-inactive-guests'),
  '20 * * * *',
  'remove-inactive-guests is scheduled every hour'
);

select * from finish();
rollback;
