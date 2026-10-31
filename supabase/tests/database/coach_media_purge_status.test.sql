-- The Monitor workflow asks coach_media_purge_status() whether the photo purge of deleted chats
-- works (#368, ADR 0067): it is unhealthy when a folder has waited over an hour and a run failed
-- it or no call succeeded lately, or when the latest call to purge-coach-media failed while a
-- folder is queued. Only the database owner can ask.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

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

-- With nothing queued, a failed latest call is no failure: no later call replaces it.
select pg_temp.answer(-6, null, 1);
select ok(
  not (select healthy from public.coach_media_purge_status()),
  'A timed out latest call with a folder queued fails'
);
create temp table queued_folders as select * from public.coach_media_deletions;
delete from public.coach_media_deletions;
select results_eq(
  $$ select queued, latest_status, healthy from public.coach_media_purge_status() $$,
  $$ values (0::bigint, 0, true) $$,
  'A timed out latest call with nothing queued is healthy'
);
insert into public.coach_media_deletions select * from queued_folders;

-- A run purges about 240 folders an hour, so a larger burst waits longer while every call succeeds.
select pg_temp.answer(-7, 200, 0);
insert into public.coach_media_deletions (thread_id, user_id, queued_at)
  select id, '00000000-0000-0000-0000-00000000000a', now() - interval '2 hours'
  from generate_series(100, 340) id;
select results_eq(
  $$ select queued, oldest_queued_minutes, healthy from public.coach_media_purge_status() $$,
  $$ values (242::bigint, 120, true) $$,
  'A burst of 241 old folders with a recent successful call is healthy'
);

-- A folder over an hour old fails once a run has tried it and failed, whatever the calls answered.
update public.coach_media_deletions set attempts = 1 where thread_id = 100;
select ok(
  not (select healthy from public.coach_media_purge_status()),
  'An old folder that a run failed to purge makes the purge unhealthy'
);
select ok(public.coach_media_purge_stalled(), 'The warning of the scheduled call uses the same rule');
update public.coach_media_deletions set attempts = 0;

-- Old folders without a recent successful call mean the purge has stopped.
delete from public.coach_media_purge_requests;
select pg_temp.answer(-8, 401, 1);
select ok(
  not (select healthy from public.coach_media_purge_status()),
  'Old folders with a refused call make the purge unhealthy'
);

delete from public.coach_media_purge_requests;
select results_eq(
  $$ select responses, latest_status, healthy from public.coach_media_purge_status() $$,
  $$ values (0::bigint, null::integer, false) $$,
  'Old folders without any call, as when cron calls nothing, make the purge unhealthy'
);

select pg_temp.answer(-9, 200, 20);
select results_eq(
  $$ select latest_status, healthy from public.coach_media_purge_status() $$,
  $$ values (200, false) $$,
  'Old folders whose last successful call is over 15 minutes old make the purge unhealthy'
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
  not has_function_privilege(role, function, 'execute'),
  role || ' cannot call ' || function
)
from (values ('anon'), ('authenticated'), ('service_role')) roles (role)
cross join (values ('public.coach_media_purge_status()'), ('public.coach_media_purge_stalled()'))
  functions (function);

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
