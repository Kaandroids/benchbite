-- The Monitor workflow asks coach_media_purge_status() whether the photo purge of deleted chats
-- works (#368, ADR 0067): it is unhealthy when a folder has waited over an hour or the latest call
-- to purge-coach-media failed. Only the database owner can ask.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Answers from pg_net, made up here for requests with negative ids that pg_net never uses.
create function pg_temp.answer(request_id bigint, status_code integer, minutes_ago integer)
returns void language sql as $$
  insert into public.coach_media_purge_requests (request_id, requested_at)
    values (request_id, now() - make_interval(mins => minutes_ago));
  insert into net._http_response (id, status_code, timed_out, created)
    values (request_id, status_code, status_code is null, now() - make_interval(mins => minutes_ago));
$$;

delete from public.coach_media_deletions;
delete from public.coach_media_purge_requests;

select results_eq(
  $$ select queued, oldest_queued_minutes, responses, healthy from public.coach_media_purge_status() $$,
  $$ values (0::bigint, null::integer, 0::bigint, true) $$,
  'With nothing queued and nothing called, the purge is healthy'
);

insert into public.coach_media_deletions (thread_id, user_id, queued_at)
  values (1, '00000000-0000-0000-0000-00000000000a', now() - interval '10 minutes');
select results_eq(
  $$ select queued, oldest_queued_minutes, healthy from public.coach_media_purge_status() $$,
  $$ values (1::bigint, 10, true) $$,
  'A folder queued for minutes is healthy, as the next run purges it'
);

-- The scheduled call records its request, so that its response can be found.
delete from vault.secrets where name in ('project_url', 'secret_key');
select vault.create_secret('http://functions.test', 'project_url');
select vault.create_secret('sb_secret_test', 'secret_key');
create temp table sent as select public.request_coach_media_purge() as request_id;
select results_eq(
  $$ select request_id from public.coach_media_purge_requests $$,
  $$ select request_id from sent where request_id is not null $$,
  'The scheduled call records the id of its request'
);
select is(
  (select latest_status from public.coach_media_purge_status()), null,
  'A request without a response yet does not count'
);

-- Requests older than a day are removed when the next one is sent.
insert into public.coach_media_purge_requests (request_id, requested_at)
  values (-100, now() - interval '2 days');
select public.request_coach_media_purge();
select is(
  (select count(*) from public.coach_media_purge_requests where request_id = -100), 0::bigint,
  'Requests older than a day are removed'
);

-- The latest answer decides; earlier failures are only counted.
select pg_temp.answer(-1, 401, 30);
select results_eq(
  $$ select responses, failed_responses, failed_statuses, latest_status, healthy
     from public.coach_media_purge_status() $$,
  $$ values (1::bigint, 1::bigint, '{401}'::integer[], 401, false) $$,
  'A refused call makes the purge unhealthy'
);

select pg_temp.answer(-2, 200, 20);
select results_eq(
  $$ select responses, failed_responses, failed_statuses, latest_status, healthy
     from public.coach_media_purge_status() $$,
  $$ values (2::bigint, 1::bigint, '{401}'::integer[], 200, true) $$,
  'A later successful call makes it healthy again'
);

select pg_temp.answer(-3, null, 10);
select results_eq(
  $$ select failed_statuses, latest_status, healthy from public.coach_media_purge_status() $$,
  $$ values ('{0,401}'::integer[], 0, false) $$,
  'A timed out call fails, with 0 as its status'
);

select pg_temp.answer(-4, 204, 5);
select ok((select healthy from public.coach_media_purge_status()), 'Any 2xx status succeeds');

-- Responses to other pg_net requests are not the purge's.
insert into net._http_response (id, status_code, created) values (-5, 500, now());
select results_eq(
  $$ select responses, latest_status from public.coach_media_purge_status() $$,
  $$ values (4::bigint, 204) $$,
  'Responses to other requests are ignored'
);

-- A folder waiting over an hour means the purge keeps failing, whatever the calls answered.
update public.coach_media_deletions set queued_at = now() - interval '61 minutes';
select results_eq(
  $$ select oldest_queued_minutes, healthy from public.coach_media_purge_status() $$,
  $$ values (61, false) $$,
  'A folder queued for over an hour makes the purge unhealthy'
);

-- The status shows no user ids or folders, and only the owner can ask for it.
select is(
  (select array_agg(attname::text order by attnum)
   from pg_attribute
   where attrelid = 'public.coach_media_purge_requests'::regclass and attnum > 0
     and not attisdropped),
  array['request_id', 'requested_at'],
  'The request log holds only request ids and times'
);

select ok(
  not has_function_privilege(role, 'public.coach_media_purge_status()', 'execute'),
  role || ' cannot ask for the purge status'
)
from (values ('anon'), ('authenticated'), ('service_role')) roles (role);

select ok(
  not bool_or(has_table_privilege(role, 'public.coach_media_purge_requests', privilege)),
  'Clients cannot read or change the request log'
)
from (values ('anon'), ('authenticated')) roles (role)
cross join (values ('select'), ('insert'), ('update'), ('delete')) privileges (privilege);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.coach_media_purge_requests'::regclass),
  'The request log has row level security'
);

select * from finish();
rollback;
