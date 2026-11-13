-- Logging weights: one entry per user and day, corrected by logging again, written only through
-- log_weight() (ADR 0100), each user's apart from the others'.
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
-- Its helpers are called as the signed-in user, while new functions are closed to clients
-- (#529, ADR 0126): only they are opened, and go with the test's session.
grant execute on all functions in schema pg_temp to public;

-- An entry of an earlier day, as one logged then.
insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ('00000000-0000-0000-0000-00000000000a', 81, current_date - 1);

select throws_ok(
  $$ insert into public.weight_entries (user_id, weight_kg, measured_on)
     values ('00000000-0000-0000-0000-00000000000a', 79.5, current_date - 1) $$,
  '23505',
  null,
  'A second entry for the same day is rejected'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select lives_ok(
  $$ select public.log_weight(80, current_date) $$,
  'A user logs today''s weight'
);
select public.log_weight(79.5, current_date);
select results_eq(
  $$ select weight_kg from public.weight_entries where measured_on = current_date $$,
  $$ values (79.5::numeric(4, 1)) $$,
  'Logging again on the same day corrects the entry'
);
select is(
  (select count(*)::integer from public.weight_entries),
  2,
  'Another day keeps an entry of its own'
);

select throws_ok(
  $$ insert into public.weight_entries (user_id, weight_kg, measured_on)
     values ('00000000-0000-0000-0000-00000000000a', 79, current_date - 2) $$,
  '42501', null, 'Users cannot add an entry directly'
);
select throws_ok(
  $$ update public.weight_entries set weight_kg = 70 $$,
  '42501', null, 'Nor change one directly'
);
select throws_ok(
  $$ update public.weight_entries set created_at = now() - interval '1 year' $$,
  '42501', null, 'When an entry was created cannot be changed'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');

select lives_ok(
  $$ select public.log_weight(60, current_date) $$,
  'Another user logs the same day independently'
);
select results_eq(
  $$ select weight_kg from public.weight_entries order by measured_on $$,
  $$ values (60::numeric(4, 1)) $$,
  'Each user reads only their own entries'
);

select * from finish();
rollback;
