-- The app stops a request of its own; only the chat function reads the stops.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Old stops of A's and B's, from requests that ended long ago.
insert into public.coach_stops (request_id, user_id, created_at) values
  ('00000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-00000000000a', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000000b', now() - interval '2 hours');

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
  'The stop is the user''s, and the old stops of everyone are gone'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select lives_ok(
  $$ select public.stop_coach_request('00000000-0000-0000-0000-0000000000f1') $$,
  'Another user may name the same request'
);
reset role;
select results_eq(
  $$ select user_id::text from public.coach_stops order by user_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b') $$,
  'and it is a stop of their own, which leaves the first user''s as it was'
);

-- B fills their stops up to the most a user keeps.
insert into public.coach_stops (request_id, user_id)
select gen_random_uuid(), '00000000-0000-0000-0000-00000000000b' from generate_series(1, 19);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ select public.stop_coach_request(gen_random_uuid()) $$,
  '54000',
  null,
  'A user with 20 stops may not add one'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.stop_coach_request(gen_random_uuid()) $$,
  'while others still may'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.stop_coach_request(uuid)', 'execute'),
  'Signed-out callers may not stop a request'
);

select * from finish();
rollback;
