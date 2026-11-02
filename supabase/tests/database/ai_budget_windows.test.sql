-- AI budgets by each plan's windows (#409, ADR 0078): a yearly plan's months, weeks cut at their
-- period's end, the trial apart from the first paid period, the window that refuses, and a free
-- user's photo estimates counted by number behind a backstop of what they did cost.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Budget periods and weeks.
select is(
  public.budget_period('2027-01-31', '2028-01-31', 'yearly', '2027-03-15'),
  tstzrange('2027-02-28', '2027-03-31'),
  'A yearly plan''s month starts on its day, or the month''s last'
);
select is(
  public.budget_period('2027-01-31', '2028-01-31', 'yearly', '2027-03-31'),
  tstzrange('2027-03-31', '2027-04-30'),
  'and counts each from the plan''s start, so that it does not drift'
);
select is(
  public.budget_period('2027-01-31', '2028-01-31', 'yearly', '2028-01-15'),
  tstzrange('2027-12-31', '2028-01-31'),
  'up to the plan''s end'
);
select is(
  public.budget_period('2027-01-15', '2027-02-15', 'monthly', '2027-02-01'),
  tstzrange('2027-01-15', '2027-02-15'),
  'A monthly plan''s budget period is its billing period'
);
select is(
  public.week_of(tstzrange('2027-01-01', '2027-01-31'), '2027-01-30'),
  tstzrange('2027-01-29', '2027-01-31'),
  'Weeks are 7-day steps of the period, the last one cut at its end'
);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', false),
  ('00000000-0000-0000-0000-00000000000d', null, true);
-- C's account is two days old, so its free week began then.
update auth.users set created_at = now() - interval '2 days'
  where id = '00000000-0000-0000-0000-00000000000c';

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.used(
  user_id uuid, feature public.ai_feature, cost numeric, at timestamptz,
  free boolean default false, given boolean default null
) returns void language sql as $$
  insert into public.ai_usage
    (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
     thinking_tokens, cost_usd, created_at, free, given)
  values (gen_random_uuid(), user_id, feature, 'test-flash', 0, 0, 0, 0, cost, at, free, given);
$$;

-- A model whose price never changes, and one whose answer costs more than a free week's backstop.
insert into public.ai_model_prices (model, valid_from, input_usd, cached_input_usd, output_usd)
values ('test-flash', '2000-01-01', 0.75, 0.075, 3.75), ('test-dear', '2000-01-01', 1, 0.1, 100);

-- A, premium for ten days: a week of the period that has less left decides.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000a', 'premium', now() - interval '10 days',
  now() + interval '20 days', 'monthly', 'manual');
select pg_temp.used('00000000-0000-0000-0000-00000000000a', 'coach_chat', 1.00, now() - interval '8 days');
select pg_temp.used('00000000-0000-0000-0000-00000000000a', 'coach_chat', 1.50, now() - interval '1 day');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select allowed, reason, used_usd, resets_at = now() + interval '4 days' from public.ai_access() $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason, 1.50::numeric, true) $$,
  'A week''s budget spent refuses until the week ends'
);
reset role;
select pg_temp.used('00000000-0000-0000-0000-00000000000a', 'coach_chat', 1.50, now() - interval '9 days');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select allowed, reason, resets_at = now() + interval '20 days' from public.ai_access() $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason, true) $$,
  'and a period''s spent, until the later end, the period''s'
);
select is(
  (select allowed from public.start_ai_call('coach_chat', 'test-flash', 0)),
  false,
  'and no call starts'
);

-- B: a trial that spent its $1.50, then premium, which is a budget period of its own.
reset role;
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
values ('00000000-0000-0000-0000-00000000000b', 'trial', now() - interval '5 days',
  now() + interval '2 days', 'monthly', 'manual');
select pg_temp.used('00000000-0000-0000-0000-00000000000b', 'coach_chat', 1.50, now() - interval '1 day');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select reason, budget_usd from public.ai_access() $$,
  $$ values ('limit_reached'::public.ai_access_reason, 1.50::numeric) $$,
  'The trial has its $1.50'
);
reset role;
update public.subscriptions set plan = 'premium', period_start = now() - interval '1 hour',
  period_end = now() + interval '30 days'
  where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select allowed, used_usd from public.ai_access() $$,
  $$ values (true, 0::numeric) $$,
  'and what it spent does not count toward premium'
);

-- C, on the free plan: photo estimates only, two a free week.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, reason from public.ai_access() $$,
  $$ values (false, 'plan_required'::public.ai_access_reason) $$,
  'A free user has no Bite'
);
select results_eq(
  $$ select allowed, counted, left_count, resets_at = now() + interval '5 days'
     from public.ai_access('meal_photo') $$,
  $$ values (true, true, 2, true) $$,
  'but two photo estimates a week, from when the account was made'
);
create temporary table calls (name text primary key, call_id uuid) on commit drop;
grant select, insert on calls to authenticated, service_role;
insert into calls select 'first', call_id from public.start_ai_call('meal_photo', 'test-dear', 8000);
select ok(
  (select call_id from calls where name = 'first') is not null,
  'A free photo starts though its answer could cost more than the backstop'
);
select is((select left_count from public.ai_access('meal_photo')), 1, 'and counts while it runs');

reset role;
set local role service_role;
select public.record_ai_usage((select call_id from calls where name = 'first'), 1000, 0, 100, 0, given => false);
reset role;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select is(
  (select left_count from public.ai_access('meal_photo')),
  2,
  'A call that gave no estimate does not count'
);
select ok(
  (select free from public.ai_usage where call_id = (select call_id from calls where name = 'first')),
  'and is kept as made on the free plan'
);

insert into calls select 'second', call_id from public.start_ai_call('meal_photo', 'test-flash', 8000);
reset role;
set local role service_role;
select public.record_ai_usage((select call_id from calls where name = 'second'), 1000, 0, 100, 0, given => true);
reset role;
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select is((select left_count from public.ai_access('meal_photo')), 1, 'One that gave an estimate does');

reset role;
select pg_temp.used('00000000-0000-0000-0000-00000000000c', 'meal_photo', 0.001, now() - interval '1 hour', true, true);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, reason, left_count from public.ai_access('meal_photo') $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason, 0) $$,
  'Two estimates use up the week'
);
select is(
  (select allowed from public.start_ai_call('meal_photo', 'test-flash', 0)),
  false,
  'and no other starts'
);

-- Last week's estimates and calls do not count; this week's free calls are held to the backstop.
reset role;
delete from public.ai_usage where user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.used('00000000-0000-0000-0000-00000000000c', 'meal_photo', 5, now() - interval '3 days', true, true);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select is((select left_count from public.ai_access('meal_photo')), 2, 'An earlier week does not count');
reset role;
select pg_temp.used('00000000-0000-0000-0000-00000000000c', 'meal_photo', 0.10, now() - interval '1 hour', true, false);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, reason, left_count from public.ai_access('meal_photo') $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason, 2) $$,
  'Free calls that gave nothing still stop at the backstop'
);

-- What a user spent while premium is no free spending.
reset role;
delete from public.ai_usage where user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.used('00000000-0000-0000-0000-00000000000c', 'meal_photo', 3, now() - interval '1 hour');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, left_count, used_usd from public.ai_access('meal_photo') $$,
  $$ values (true, 2, 0::numeric) $$,
  'Calls made while premium count toward neither the number nor the backstop'
);

-- Guests, and who may count the windows.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000d');
select results_eq(
  $$ select allowed, reason from public.ai_access('meal_photo') $$,
  $$ values (false, 'account_required'::public.ai_access_reason) $$,
  'A guest has no free estimates, as AI needs an account'
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  $$ select public.ai_windows('00000000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'Users count no one''s windows themselves'
);
select throws_ok(
  $$ select public.record_ai_usage(gen_random_uuid(), 0, 0, 0, 0, given => true) $$,
  '42501', null,
  'nor say a call gave an estimate'
);

select * from finish();
rollback;
