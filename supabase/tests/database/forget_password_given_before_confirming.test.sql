-- A password given before an address was confirmed is forgotten when it is (ADR 0091).
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'new@example.com', 'given-before', null),
  ('00000000-0000-0000-0000-00000000000b', 'confirmed@example.com', 'own', now());

update auth.users set email_confirmed_at = now()
  where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000000a'),
  '',
  'Confirming an address forgets the password given before'
);

update auth.users set encrypted_password = 'set-after'
  where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000000a'),
  'set-after',
  'A password set after confirming stays'
);

update auth.users set email_confirmed_at = now()
  where id = '00000000-0000-0000-0000-00000000000b';
select is(
  (select encrypted_password from auth.users where id = '00000000-0000-0000-0000-00000000000b'),
  'own',
  'An address confirmed before keeps its password'
);

select * from finish();
rollback;
