-- The photos of custom exercises are private: each user reads, uploads and removes only the photos
-- in the folder named after their id, and anon none at all (ADR 0027).
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- The Storage API deletes with this set; without it storage refuses every delete.
select set_config('storage.allow_delete_query', 'true', true);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('exercise-photos', '00000000-0000-0000-0000-00000000000a/1.jpg') $$,
  'Users upload photos to their own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('exercise-photos', '00000000-0000-0000-0000-00000000000b/1.jpg') $$,
  '42501', null,
  'Users cannot upload photos to the folder of another user'
);
select isnt_empty(
  $$ select 1 from storage.objects where bucket_id = 'exercise-photos' $$,
  'Users read their own photos'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'exercise-photos' $$,
  'Users cannot read the photos of another user'
);
select is_empty(
  $$ delete from storage.objects where bucket_id = 'exercise-photos' returning 1 $$,
  'Users cannot remove the photos of another user'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select is_empty(
  $$ select 1 from storage.objects where bucket_id = 'exercise-photos' $$,
  'Anon cannot read photos'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('exercise-photos', '00000000-0000-0000-0000-00000000000a/2.jpg') $$,
  '42501', null,
  'Anon cannot upload photos'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select isnt_empty(
  $$ delete from storage.objects where bucket_id = 'exercise-photos' returning 1 $$,
  'Users remove their own photos'
);

select * from finish();
rollback;
