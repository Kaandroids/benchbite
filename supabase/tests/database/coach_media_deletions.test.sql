-- Deleting a chat, or the account it belongs to, queues the chat's photo folder for
-- purge-coach-media (ADR 0063). Clients can neither read nor change the queue, and the scheduled
-- call reads its URL and key from Vault.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The chat function writes the threads: one of A's, two of B's.
set local role service_role;
insert into public.coach_threads (id, user_id, created_at)
  overriding system value
  values
    (1, '00000000-0000-0000-0000-00000000000a', '2026-10-31 10:00'),
    (2, '00000000-0000-0000-0000-00000000000b', '2026-10-31 10:00'),
    (3, '00000000-0000-0000-0000-00000000000b', '2026-10-31 10:00');
reset role;

-- The scheduled call does nothing while nothing is queued.
select is(public.request_coach_media_purge(), null, 'Nothing is called while the queue is empty');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
delete from public.coach_threads where id = 1;
reset role;
select results_eq(
  $$ select thread_id, user_id, attempts from public.coach_media_deletions $$,
  $$ values (1::bigint, '00000000-0000-0000-0000-00000000000a'::uuid, 0) $$,
  'Deleting a chat queues its photo folder'
);

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select results_eq(
  $$ select thread_id, user_id from public.coach_media_deletions where thread_id <> 1 order by 1 $$,
  $$ values (2::bigint, '00000000-0000-0000-0000-00000000000b'::uuid),
            (3::bigint, '00000000-0000-0000-0000-00000000000b'::uuid) $$,
  'Deleting an account queues the photo folders of all its chats'
);

-- Clients have no access to the queue, not even to their own folders.
select ok(
  not bool_or(has_table_privilege(role, 'public.coach_media_deletions', privilege)),
  'Clients cannot ' || privilege || ' the queue'
)
from (values ('anon'), ('authenticated')) roles (role)
cross join (values ('select'), ('insert'), ('update'), ('delete')) privileges (privilege)
group by privilege
order by privilege;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select 1 from public.coach_media_deletions $$,
  '42501', null,
  'Users cannot read the queue'
);
select throws_ok(
  $$ delete from public.coach_media_deletions $$,
  '42501', null,
  'Users cannot remove folders from the queue'
);
reset role;

select ok(
  not bool_or(has_function_privilege(role, 'public.request_coach_media_purge()', 'execute')),
  'Only the scheduled job calls purge-coach-media'
)
from (values ('anon'), ('authenticated'), ('service_role')) roles (role);

-- Without the Vault secrets nothing is sent, and with them the function is called with the key.
delete from vault.secrets where name in ('project_url', 'secret_key');
select is(public.request_coach_media_purge(), null, 'Nothing is called without the Vault secrets');

select vault.create_secret('http://functions.test', 'project_url');
select vault.create_secret('sb_secret_test', 'secret_key');
select isnt(public.request_coach_media_purge(), null, 'With queued folders, purge-coach-media is called');
select results_eq(
  $$ select url, headers ->> 'apikey' from net.http_request_queue
     where url like 'http://functions.test/%' $$,
  $$ values ('http://functions.test/functions/v1/purge-coach-media', 'sb_secret_test') $$,
  'The call takes the URL and the secret key from Vault'
);

select is(
  (select schedule from cron.job where jobname = 'purge-coach-media'),
  '*/5 * * * *',
  'purge-coach-media is scheduled every five minutes'
);

select * from finish();
rollback;
