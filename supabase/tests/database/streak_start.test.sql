-- streak_start() gives the caller's first day, back to which the week strip pages (ADR 0043): the
-- day their plan started, or the day the account was created. Only the caller's own.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '2026-09-01 10:00:00+00'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '2026-09-03 10:00:00+00');
insert into public.planned_days_kept (user_id, through, started_on)
  values ('00000000-0000-0000-0000-00000000000a', '2026-09-10', '2026-09-05');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(public.streak_start(), '2026-09-05'::date, 'A user starts on the day their plan started');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select is(
  public.streak_start(),
  '2026-09-03'::date,
  'A user without a recorded start starts on the day the account was created'
);

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.streak_start() $$, '42501', null, 'Anon gets nothing');

select * from finish();
rollback;
