-- The Data API runs check_app_version() before every request: it refuses a signed-in build of the
-- app whose version is no longer supported, and lets everything else pass, as a fault in a check
-- that every request goes through would stop the whole app. The refusal has the form the Data API
-- answers 426 Upgrade Required from, with the app's code BB064 in its message.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- The values of the migration, whatever a developer set since.
update public.supported_app_versions set lowest_version = '1.4.0' where platform = 'ios';
update public.supported_app_versions set lowest_version = '0.0.0' where platform = 'android';

-- A request as the Data API sets it up before the check: its headers and its path.
create function pg_temp.request(headers text, path text default '/workouts')
returns void
language sql
as $$
  select set_config('request.headers', headers, true), set_config('request.path', path, true);
$$;
grant execute on all functions in schema pg_temp to public;

select ok(
  (select rolconfig @> array['pgrst.db_pre_request=public.check_app_version']
   from pg_roles where rolname = 'authenticator'),
  'The Data API runs the check before each request'
);
select ok(
  has_function_privilege('anon', 'public.check_app_version()', 'execute')
    and has_function_privilege('authenticated', 'public.check_app_version()', 'execute')
    and has_function_privilege('service_role', 'public.check_app_version()', 'execute'),
  'Every role a request runs as can run it, or its requests would fail'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.check_app_version()'::regprocedure),
  'It holds no rights of its own'
);

set local role authenticated;
select pg_temp.request('{"x-app-platform": "ios", "x-app-version": "1.3.9"}');
select throws_ok(
  $$ select public.check_app_version() $$, 'PGRST', null,
  'A build below the lowest supported version is refused'
);
select throws_like(
  $$ select public.check_app_version() $$, '%"code" : "BB064"%',
  'with the code the app knows it by'
);
select is(
  (public.app_requirements('ios', '1.3.9') ->> 'supported')::boolean, false,
  'and told to update by the same rule'
);
select pg_temp.request('{"x-app-platform": "ios", "x-app-version": "1.3.9"}', '/rpc/ai_access');
select throws_ok(
  $$ select public.check_app_version() $$, 'PGRST', null, 'when it calls a function too'
);
select pg_temp.request(
  '{"x-app-platform": "ios", "x-app-version": "1.3.9"}', '/rpc/app_requirements'
);
select lives_ok(
  $$ select public.check_app_version() $$,
  'but not when it asks what it has to hold to, which tells it to update'
);
select pg_temp.request('{"x-app-platform": "ios", "x-app-version": "1.4.0"}');
select lives_ok(
  $$ select public.check_app_version() $$, 'The lowest supported version passes'
);
select pg_temp.request('{"x-app-platform": "ios", "x-app-version": "1.10"}');
select lives_ok($$ select public.check_app_version() $$, 'and so does a later one');
select pg_temp.request('{"x-app-platform": "android", "x-app-version": "0.1.0"}');
select lives_ok($$ select public.check_app_version() $$, 'Each platform has its own');

select pg_temp.request('{"user-agent": "curl"}');
select lives_ok(
  $$ select public.check_app_version() $$, 'A request that names no version passes'
);
select pg_temp.request('{"x-app-version": "1.3.9"}');
select lives_ok($$ select public.check_app_version() $$, 'as does one that names no platform');
select pg_temp.request('{"x-app-platform": "web", "x-app-version": "1.3.9"}');
select lives_ok($$ select public.check_app_version() $$, 'or a platform there is no rule for');
select pg_temp.request('{"x-app-platform": "ios", "x-app-version": "1.3.9-beta"}');
select lives_ok($$ select public.check_app_version() $$, 'or a version that cannot be read');
select pg_temp.request('not json');
select lives_ok(
  $$ select public.check_app_version() $$, 'A fault within the check lets the request pass'
);

select throws_ok(
  $$ select 1 from public.supported_app_versions $$, '42501', null,
  'The check opens the supported versions to nobody'
);

-- The backend's own requests and those without a session are not the app's to judge.
set local role service_role;
select pg_temp.request('{"x-app-platform": "ios", "x-app-version": "1.3.9"}');
select lives_ok($$ select public.check_app_version() $$, 'The service role is not checked');
set local role anon;
select lives_ok(
  $$ select public.check_app_version() $$, 'nor is a client without a session'
);

select * from finish();
rollback;
