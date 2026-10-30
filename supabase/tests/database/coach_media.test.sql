-- The photos sent to Bite are private: each user reads only the photos in the folder named after
-- their id, anon none at all, and only the chat function, with the service role, writes them
-- (ADR 0062).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- The Storage API deletes with this set; without it storage refuses every delete.
select set_config('storage.allow_delete_query', 'true', true);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The chat function writes with the service role.
select set_config('role', 'service_role', true),
  set_config('request.jwt.claims', '{"role": "service_role"}', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values
       ('coach-media', '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000c1/1.jpg'),
       ('coach-media', '00000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-0000000000c2/1.jpg') $$,
  'The chat function stores photos'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select name from storage.objects where bucket_id = 'coach-media' $$,
  $$ values ('00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000c1/1.jpg') $$,
  'Users read their own photos, and not those of another user'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('coach-media', '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000c1/2.jpg') $$,
  '42501', null,
  'Users cannot upload photos, not even to their own folder'
);
select is_empty(
  $$ update storage.objects set name = name || '.copy' where bucket_id = 'coach-media' returning 1 $$,
  'Users cannot change their photos'
);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'coach-media' returning 1 $$,
  'Users cannot remove their photos'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select name from storage.objects where bucket_id = 'coach-media' $$,
  $$ values ('00000000-0000-0000-0000-00000000000b/00000000-0000-0000-0000-0000000000c2/1.jpg') $$,
  'Another user reads only their own photos'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'coach-media' $$,
  'Anon cannot read photos'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('coach-media', '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000c1/3.jpg') $$,
  '42501', null,
  'Anon cannot upload photos'
);

select set_config('role', 'postgres', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'coach-media'),
  2,
  'No photo was changed or removed'
);

select * from finish();
rollback;
