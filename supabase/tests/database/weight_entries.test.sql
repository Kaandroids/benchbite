-- Logging weights: one entry per user and day, corrected by logging again.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 80, '2026-10-21');

select throws_ok(
  $$ insert into public.weight_entries (user_id, weight_kg, measured_on)
     values ('00000000-0000-0000-0000-00000000000a', 79.5, '2026-10-21') $$,
  '23505',
  null,
  'A second entry for the same day is rejected'
);

-- What the app sends: insert, or correct the day's entry.
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 79.5, '2026-10-21')
  on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg;

select results_eq(
  $$ select weight_kg from public.weight_entries where measured_on = '2026-10-21' $$,
  $$ values (79.5::numeric(4, 1)) $$,
  'Logging again on the same day corrects the entry'
);
-- The app's upsert sets every column it sends again.
select lives_ok(
  $$ insert into public.weight_entries (user_id, weight_kg, measured_on)
     values ('00000000-0000-0000-0000-00000000000a', 79.4, '2026-10-21')
     on conflict (user_id, measured_on) do update
     set user_id = excluded.user_id, measured_on = excluded.measured_on, weight_kg = excluded.weight_kg $$,
  'The app''s upsert still corrects the entry'
);
select throws_ok(
  $$ update public.weight_entries set created_at = now() - interval '1 year' $$,
  '42501', null, 'When an entry was created cannot be changed'
);

insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 79, '2026-10-22');

select is(
  (select count(*)::integer from public.weight_entries),
  2,
  'Another day gets an entry of its own'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select lives_ok(
  $$ insert into public.weight_entries (user_id, weight_kg, measured_on)
     values ('00000000-0000-0000-0000-00000000000b', 60, '2026-10-21') $$,
  'Another user logs the same day independently'
);

select throws_ok(
  $$ insert into public.weight_entries (user_id, weight_kg, measured_on)
     values ('00000000-0000-0000-0000-00000000000a', 50, '2026-10-21')
     on conflict (user_id, measured_on) do update set weight_kg = excluded.weight_kg $$,
  '42501',
  null,
  'A user cannot correct another user''s entry'
);

select results_eq(
  $$ select weight_kg from public.weight_entries order by measured_on $$,
  $$ values (60::numeric(4, 1)) $$,
  'A user only sees their own entries'
);

select * from finish();
rollback;
