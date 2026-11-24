-- Saving a password asks send-password-email to email the owner (#481, ADR 0167): a welcome for an
-- account's first password, "changed" for any later one, nothing for a password forgotten as an
-- address is confirmed or for a guest, and never a password that is not saved for it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

delete from vault.secrets where name in ('project_url', 'secret_key');
select vault.create_secret('http://functions.test', 'project_url');
select vault.create_secret('sb_secret_test', 'secret_key');

create function pg_temp.asked() returns table (user_id uuid, kind text) language sql as $$
  select (convert_from(body, 'UTF8')::jsonb ->> 'userId')::uuid,
    convert_from(body, 'UTF8')::jsonb ->> 'kind'
  from net.http_request_queue
  where url = 'http://functions.test/functions/v1/send-password-email'
  order by id;
$$;

-- A signs up with a password, B is a guest, C has had a password for long.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'new@example.com', 'given-before', null, false),
  ('00000000-0000-0000-0000-00000000000b', null, '', null, true),
  ('00000000-0000-0000-0000-00000000000c', 'old@example.com', 'own', now(), false);

-- Confirming A's address forgets the password given before it, which emails nothing.
update auth.users set email_confirmed_at = now()
  where id = '00000000-0000-0000-0000-00000000000a';
select is_empty($$ select * from pg_temp.asked() $$, 'A password forgotten emails nothing');

update auth.users set encrypted_password = 'first'
  where id = '00000000-0000-0000-0000-00000000000a';
select results_eq(
  $$ select * from pg_temp.asked() $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'welcome') $$,
  'An account''s first password welcomes it'
);

update auth.users set encrypted_password = 'second'
  where id = '00000000-0000-0000-0000-00000000000a';
update auth.users set encrypted_password = 'changed'
  where id = '00000000-0000-0000-0000-00000000000c';
select results_eq(
  $$ select * from pg_temp.asked() offset 1 $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'changed'),
            ('00000000-0000-0000-0000-00000000000c'::uuid, 'changed') $$,
  'A later password says it was changed'
);
select results_eq(
  $$ select headers ->> 'apikey' from net.http_request_queue
     where url = 'http://functions.test/functions/v1/send-password-email' limit 1 $$,
  $$ values ('sb_secret_test') $$,
  'The call takes the secret key from Vault'
);

update auth.users set encrypted_password = 'changed'
  where id = '00000000-0000-0000-0000-00000000000c';
select is(
  (select count(*) from pg_temp.asked())::integer, 3,
  'Nothing is emailed when the password stays the same'
);

-- A guest has no address to email.
update auth.users set encrypted_password = 'guest-password'
  where id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*) from pg_temp.asked())::integer, 3, 'A guest is emailed nothing');

-- Without the Vault secrets the password is still saved, without its email.
delete from vault.secrets where name in ('project_url', 'secret_key');
select lives_ok(
  $$ update auth.users set encrypted_password = 'third'
     where id = '00000000-0000-0000-0000-00000000000c' $$,
  'A password is saved without the Vault secrets'
);
select is(
  (select count(*) from net.http_request_queue
   where url like '%send-password-email')::integer, 3,
  'and nothing is asked'
);

select * from finish();
rollback;
