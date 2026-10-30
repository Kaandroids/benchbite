-- The app stops a request of its own; only the chat function reads the stops.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- An old stop of A's, from a request that ended long ago.
insert into public.coach_stops (request_id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000000a', now() - interval '2 hours');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.stop_coach_request('00000000-0000-0000-0000-0000000000f1') $$,
  'A user stops a request'
);
select lives_ok(
  $$ select public.stop_coach_request('00000000-0000-0000-0000-0000000000f1') $$,
  'twice, as a second tap does'
);
select throws_ok(
  $$ select * from public.coach_stops $$,
  '42501',
  null,
  'but reads no stops'
);

reset role;
select results_eq(
  $$ select request_id::text, user_id::text from public.coach_stops $$,
  $$ values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a') $$,
  'The stop is the user''s, and their old one is gone'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select lives_ok(
  $$ select public.stop_coach_request('00000000-0000-0000-0000-0000000000f1') $$,
  'Another user naming the same request changes nothing'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.stop_coach_request(uuid)', 'execute'),
  'Signed-out callers may not stop a request'
);

select * from finish();
rollback;
