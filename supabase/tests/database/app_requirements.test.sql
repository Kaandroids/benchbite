-- The app asks what it has to hold to: whether its version is supported, and the current version
-- of each text a user agrees to. Anyone with a session may ask, guests too; nobody reads or
-- changes the tables behind it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

-- The values of the migration, whatever a developer set since.
update public.supported_app_versions set lowest_version = '1.4.0' where platform = 'ios';
update public.supported_app_versions set lowest_version = '0.0.0' where platform = 'android';
delete from public.agreement_versions;
insert into public.agreement_versions (agreement, version, applies_at, summary) values
  ('terms', '2026-11-18', '2026-11-18', '{}'),
  ('terms', '2027-02-01', '2027-03-03', '{"en": "Premium by the year", "de": "Premium im Jahr"}'),
  ('health_consent', '2026-10-21', '2026-10-21', '{}'),
  ('ai_consent', '2026-11-18', '2026-11-18', '{}');

select is(public.version_number('1.4.2'), array[1, 4, 2], 'A version reads as three numbers');
select is(public.version_number('2'), array[2, 0, 0], 'with the parts it leaves out as zero');
select ok(
  public.version_number('1.10.0') > public.version_number('1.9.9'),
  'which compare as numbers, not as text'
);
select ok(
  public.version_number('1.4.0-beta') is null and public.version_number('') is null
    and public.version_number('1.2.3.4') is null and public.version_number(null) is null,
  'Anything else is no version'
);

set local role anon;
select throws_ok(
  $$ select public.app_requirements('ios', '1.4.0') $$, '42501', null,
  'A client without a session cannot ask'
);

select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select is(
  (public.app_requirements('ios', '1.4.0') ->> 'supported')::boolean, true,
  'The lowest supported version is supported'
);
select is(
  (public.app_requirements('ios', '1.3.9') ->> 'supported')::boolean, false,
  'A version below it is not'
);
select is(
  (public.app_requirements('ios', '2.0') ->> 'supported')::boolean, true,
  'A later one is'
);
select is(
  public.app_requirements('ios', '1.3.9') ->> 'lowestVersion', '1.4.0',
  'The answer names the lowest supported version'
);
select is(
  (public.app_requirements('android', '0.1.0') ->> 'supported')::boolean, true,
  'Each platform has its own'
);
select is(
  (public.app_requirements('ios', 'next') ->> 'supported')::boolean, true,
  'A version that cannot be read is supported, so that the check locks nobody out by mistake'
);
select is(
  public.app_requirements('ios', '1.4.0') -> 'agreements' -> 'terms',
  jsonb_build_object(
    'version', '2027-02-01',
    'appliesAt', '2027-03-03'::timestamptz,
    'summary', '{"en": "Premium by the year", "de": "Premium im Jahr"}'::jsonb
  ),
  'The current terms are the latest, also before they apply, with what changed'
);
select is(
  public.app_requirements('ios', '1.4.0') #>> '{agreements,health_consent,version}', '2026-10-21',
  'with the current health data consent'
);
select is(
  public.app_requirements('ios', '1.4.0') #>> '{agreements,ai_consent,version}', '2026-11-18',
  'and the current AI consent'
);
select throws_ok(
  $$ select 1 from public.supported_app_versions $$, '42501', null,
  'Nobody reads the supported versions directly'
);
select throws_ok(
  $$ select public.version_number('1.0.0') $$, '42501', null,
  'nor calls the helper'
);

select throws_ok(
  $$ update public.agreement_versions set version = '2099-01-01' $$, '42501', null,
  'nor changes a version'
);

select * from finish();
rollback;
