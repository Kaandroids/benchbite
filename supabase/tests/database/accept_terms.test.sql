-- A user accepts the terms of use again when they change: only the current version, only for
-- themselves, and once per version.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- The terms as the migration left them, and a newer version announced for later.
delete from public.agreement_versions where agreement = 'terms';
insert into public.agreement_versions (agreement, version, applies_at) values
  ('terms', '2026-11-18', '2026-11-18'),
  ('terms', '2027-02-01', now() + interval '30 days');
insert into public.terms_acceptances (user_id, terms_version, accepted_at) values
  ('00000000-0000-0000-0000-00000000000a', '2026-11-18', '2026-11-18');

set local role anon;
select throws_ok(
  $$ select public.accept_terms('2027-02-01') $$, '42501', null,
  'A client without a session cannot accept the terms'
);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok(
  $$ select public.accept_terms('2026-11-18') $$, 'BB065', null,
  'An older version cannot be accepted'
);
select throws_ok(
  $$ select public.accept_terms('2099-01-01') $$, 'BB065', null, 'nor one that does not exist'
);
select throws_ok(
  $$ select public.accept_terms(null) $$, 'BB065', null, 'nor none'
);
select lives_ok(
  $$ select public.accept_terms('2027-02-01') $$,
  'The current version can, also before the day it applies'
);
select is(
  (select array_agg(terms_version order by accepted_at) from public.terms_acceptances),
  array['2026-11-18', '2027-02-01'],
  'It is added to the history, which keeps what was accepted before'
);
select lives_ok($$ select public.accept_terms('2027-02-01') $$, 'Accepting it again is fine');
select is(
  (select count(*) from public.terms_acceptances), 2::bigint, 'and adds nothing'
);
select throws_ok(
  $$ insert into public.terms_acceptances (user_id, terms_version)
     values ('00000000-0000-0000-0000-00000000000a', '2099-01-01') $$,
  '42501', null, 'Nobody writes an acceptance directly'
);

select * from finish();
rollback;
