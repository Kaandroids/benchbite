-- Plans and who is on which (#408, ADR 0078): each plan's numbers, a subscription's plan while its
-- period and grace last, a plan given by hand by the service role only, and users reading only
-- their own subscription.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select results_eq(
  $$ select plan::text, workouts, exercises, versions, added_alternatives, budget_usd,
       weekly_budget_usd, weekly_photos, weekly_free_usd
     from public.plans p order by p.plan $$,
  $$ values
       ('free', 3, 20, 2, 1, 0.00::numeric, null::numeric, 2, 0.10::numeric),
       ('trial', 500, 20, 5, null, 1.50, 1.50, null, null),
       ('premium', 500, 20, 5, null, 4.00, 1.50, null, null) $$,
  'Each plan gives what ADR 0078 says'
);

-- Given by hand.
set local role service_role;
select is(
  public.give_plan('A@example.com', now() - interval '1 day', now() + interval '29 days'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'The service role gives a plan by an account''s email, whatever its case'
);
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'premium', 'premium by default');
select is(public.plan_of('00000000-0000-0000-0000-00000000000b'), 'free', 'A user without one is free');
select public.give_plan('a@example.com', now(), now() + interval '7 days', 'trial');
select is(
  (select count(*)::integer from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'A plan given again replaces the one before'
);
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'trial', 'as the trial');
select throws_ok(
  $$ select public.give_plan('nobody@example.com', now(), now() + interval '1 day') $$,
  'P0002', null,
  'An email without an account is refused'
);
select throws_ok(
  $$ select public.give_plan('b@example.com', now(), now() + interval '1 day', 'free') $$,
  '23514', null,
  'and so is the free plan, which needs no subscription'
);
select throws_ok(
  $$ select public.give_plan('b@example.com', now(), now() - interval '1 day') $$,
  '23514', null,
  'and a period that ends before it starts'
);

-- A plan lasts its period and an hour's grace.
update public.subscriptions set plan = 'premium',
  period_start = now() - interval '30 days', period_end = now() - interval '30 minutes';
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'premium', 'A plan lasts an hour past its period');
update public.subscriptions set period_end = now() - interval '61 minutes';
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'free', 'and ends after it');
update public.subscriptions set period_start = now() + interval '1 day', period_end = now() + interval '31 days';
select is(public.plan_of('00000000-0000-0000-0000-00000000000a'), 'free', 'One that has not begun gives nothing yet');
update public.subscriptions set period_start = now() - interval '1 day', period_end = now() + interval '29 days';

-- The caller reads their own.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select ok(public.has_premium(), 'A premium user is told so');
select results_eq(
  $$ select budget_usd, reason from public.ai_access() $$,
  $$ values (4.00::numeric, null::public.ai_access_reason) $$,
  'and has premium''s budget for AI'
);
select is((select count(*)::integer from public.subscriptions), 1, 'and reads their subscription');

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select ok(not public.has_premium(), 'A free user is not premium');
select is((select count(*)::integer from public.subscriptions), 0, 'nor reads another''s subscription');
select results_eq(
  $$ select budget_usd, reason from public.ai_access() $$,
  $$ values (0.00::numeric, 'plan_required'::public.ai_access_reason) $$,
  'and has no budget for AI'
);
select throws_ok(
  $$ insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
     values ('00000000-0000-0000-0000-00000000000b', 'premium', now(), now() + interval '1 year', 'yearly', 'manual') $$,
  '42501', null,
  'nor gives themselves a plan'
);
select throws_ok(
  $$ update public.subscriptions set period_end = now() + interval '10 years' $$,
  '42501', null,
  'nor makes one longer'
);
select throws_ok(
  $$ select public.give_plan('b@example.com', now(), now() + interval '1 year') $$,
  '42501', null,
  'nor calls the function that gives one'
);
select throws_ok($$ select 1 from public.plans $$, '42501', null, 'nor reads the plans themselves');
select throws_ok(
  $$ select public.plan_of('00000000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'nor anyone''s plan by its id'
);

select set_config('role', 'anon', true);
select throws_ok($$ select 1 from public.subscriptions $$, '42501', null, 'Guests without a session read none');
select throws_ok($$ select 1 from public.plans $$, '42501', null, 'nor the plans');
select throws_ok($$ select public.has_premium() $$, '42501', null, 'nor ask for a plan');
select throws_ok(
  $$ select public.give_plan('b@example.com', now(), now() + interval '1 year') $$,
  '42501', null,
  'nor give one'
);

-- A subscription goes with its account.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select count(*)::integer from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'A subscription goes with its account'
);

select * from finish();
rollback;
