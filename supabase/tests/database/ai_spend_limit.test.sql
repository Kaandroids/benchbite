-- The AI spend of all users together against the provider's monthly limit (ADR 0134): counted per
-- month apart from the calls, refused as service_paused once reached, and told the Monitor only
-- as percentages.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- A, whose own budget is untouched, and B, whose calls make up the month's spend of all users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values (
  '00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '1 day',
  now() + interval '29 days', 'monthly', 'manual'
);

-- The month as this test sets it: no calls, and a limit of $10 warned at 80 %.
delete from public.ai_calls_in_flight;
update public.ai_spend_limit set monthly_cap_usd = 10, alert_share = 0.8;
delete from public.ai_spend_months;

create function pg_temp.used(cost numeric, at timestamptz default now()) returns void
language sql as $$
  insert into public.ai_usage (
    call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
    thinking_tokens, cost_usd, created_at
  )
  values (
    gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'coach_chat', 'test', 0, 0, 0, 0,
    cost, at
  );
$$;
create function pg_temp.sign_in() returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims',
      '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.used(3);
select pg_temp.used(100, now() - interval '40 days');
select is(
  public.ai_month_spend_usd(), 3.000000,
  'The month counts only its own calls'
);

-- A call recorded again changes its month by the difference.
update public.ai_usage set cost_usd = 4 where cost_usd = 3;
select is(public.ai_month_spend_usd(), 4.000000, 'A call recorded again counts what it cost');

-- A deleted account's calls stay counted, as the provider still bills them.
delete from public.ai_usage where cost_usd = 4;
select is(public.ai_month_spend_usd(), 4.000000, 'Calls whose rows are gone stay counted');

select is(
  (select row(used_percent, alert_percent, paused, healthy)::text from public.ai_spend_status()),
  row(40, 80, false, true)::text,
  'Below the warning share it is healthy, in whole percentages'
);

select pg_temp.sign_in();
select is(
  (select reason from public.ai_access('coach_chat')), null,
  'Below the limit a user with budget may call a model'
);
reset role;

-- Running calls count at their most.
insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd)
values ('00000000-0000-0000-0000-00000000000b', 'meal_photo', 'test', 4.5);
select is(
  (select row(used_percent, paused, healthy)::text from public.ai_spend_status()),
  row(85, false, false)::text,
  'Past the warning share, running calls included, it is not healthy'
);
delete from public.ai_calls_in_flight;

-- A call left behind in an earlier month is recorded there, not counted toward this one.
insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd, started_at)
values ('00000000-0000-0000-0000-00000000000b', 'meal_photo', 'test', 4.5, now() - interval '40 days');
select is(
  public.ai_month_spend_usd(), 4.000000,
  'A call still running from an earlier month does not count toward this one'
);
delete from public.ai_calls_in_flight;

select pg_temp.used(6);
select is(
  (select row(used_percent, paused)::text from public.ai_spend_status()),
  row(100, true)::text,
  'At the limit it is paused'
);

select pg_temp.sign_in();
select is(
  (select row(allowed, reason)::text from public.ai_access('coach_chat')),
  row(false, 'service_paused')::text,
  'At the limit Bite is refused as service_paused'
);
select is(
  (select row(allowed, reason)::text
    from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 100)),
  row(false, 'service_paused')::text,
  'and no call starts'
);
reset role;

-- The user's own reasons say more and come first.
update public.subscriptions set period_end = now() - interval '1 hour'
where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in();
select isnt(
  (select reason from public.ai_access('coach_chat')), 'service_paused',
  'A user whose plan has no Bite is told that rather than the pause'
);
reset role;

-- Only the Monitor's read-only role reads the status; no client reads the spend.
select ok(
  has_function_privilege('supabase_read_only_user', 'public.ai_spend_status()', 'execute'),
  'The read-only role may run the status'
);
select ok(
  not has_function_privilege('authenticated', 'public.ai_spend_status()', 'execute')
    and not has_function_privilege('anon', 'public.ai_spend_status()', 'execute'),
  'Clients may not run it'
);
select ok(
  not has_table_privilege('authenticated', 'public.ai_spend_months', 'select')
    and not has_table_privilege('authenticated', 'public.ai_spend_limit', 'select'),
  'Clients may not read the spend or the limit'
);

select * from finish();
rollback;
