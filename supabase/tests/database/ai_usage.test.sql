-- What AI costs: a call is priced by the model and at the price it started on, a user reads only
-- their own usage, and a call starts only for a user with an account and a budget, under it, on a
-- priced model, and with no call of the same feature running.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com', false);

-- A and B have a plan's budget; D has none.
insert into public.ai_budgets (user_id, monthly_limit_usd) values
  ('00000000-0000-0000-0000-00000000000a', 4),
  ('00000000-0000-0000-0000-00000000000b', 4);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- Prices: Gemini 3.8 Flash costs twice as much from 2027.
select is(
  (public.ai_model_price('gemini-3.8-flash', '2026-12-31 23:59:59+00')).output_usd,
  3.7500::numeric,
  'A price holds until the next one starts'
);
select is(
  (public.ai_model_price('gemini-3.8-flash', '2027-01-01 00:00:00+00')).output_usd,
  7.5000::numeric,
  'and the next one holds from its start'
);
select ok(
  public.ai_model_price('gemini-3.8-flash', '2025-12-31') is null
    and public.ai_model_price('unknown-model', now()) is null,
  'A model has no price before its first one, nor one never priced'
);

-- A starts a chat call, and the chat function records it.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select allowed, reason, budget_usd, used_usd,
       resets_at = date_trunc('month', now(), 'UTC') + interval '1 month', call_id is not null
     from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (true, null::public.ai_access_reason, 4.00::numeric, 0::numeric, true, true) $$,
  'A user under the limit starts a call, until the month resets'
);
select results_eq(
  $$ select allowed, reason, call_id from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (false, 'call_in_progress'::public.ai_access_reason, null::uuid) $$,
  'but not a second of the same feature while the first runs'
);
select results_eq(
  $$ select allowed from public.start_ai_call('meal_photo', 'gemini-3.8-flash') $$,
  $$ values (true) $$,
  'A call of another feature starts alongside'
);
select results_eq(
  $$ select allowed, reason from public.start_ai_call('review', 'unknown-model') $$,
  $$ values (false, 'unpriced_model'::public.ai_access_reason) $$,
  'A model without a price does not start'
);

set local role service_role;

-- 1,000,000 input tokens, 400,000 of them cached, and 100,000 output tokens on Flash-Lite:
-- 600,000 × $0.30 + 400,000 × $0.03 + 100,000 × $2.50, per million. The call reports another
-- model, which it was not started on.
select is(
  public.record_ai_usage(
    '00000000-0000-0000-0000-00000000000a', 'coach_chat',
    (select call_id from public.ai_calls_in_flight where feature = 'coach_chat'),
    'unknown-model', 1000000, 400000, 100000, 20000
  ),
  0.442000::numeric,
  'A call costs its input, cached input and output at the model''s prices'
);
select results_eq(
  $$ select feature::text, model, input_tokens, cached_input_tokens, output_tokens,
       thinking_tokens, cost_usd
     from public.ai_usage $$,
  $$ values ('coach_chat', 'gemini-3.5-flash-lite', 1000000, 400000, 100000, 20000, 0.442000) $$,
  'and is recorded with its tokens, under the model it was started on'
);
select is(
  public.record_ai_usage(
    '00000000-0000-0000-0000-00000000000a', 'meal_photo',
    (select call_id from public.ai_calls_in_flight where feature = 'meal_photo'),
    'gemini-3.8-flash', 1, 0, 0, 0
  ),
  0.000001::numeric,
  'A cost is returned as it is stored, to a millionth of a dollar'
);
select is_empty(
  $$ select 1 from public.ai_calls_in_flight $$,
  'Recording a call ends it'
);

select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', null, 'unknown-model', 1, 0, 1, 0) $$,
  'BB033', null,
  'A call without a place is priced by the model it reports, which needs a price'
);

-- A call that started before a price change is priced, and counted, as of its start.
insert into public.ai_calls_in_flight (user_id, feature, model, call_id, started_at) values
  ('00000000-0000-0000-0000-00000000000d', 'review', 'gemini-3.8-flash',
   '00000000-0000-0000-0000-0000000000ff', '2026-12-31 23:59:50+00');
select is(
  public.record_ai_usage(
    '00000000-0000-0000-0000-00000000000d', 'review', '00000000-0000-0000-0000-0000000000ff',
    'gemini-3.8-flash', 0, 0, 1000000, 0
  ),
  3.750000::numeric,
  'A call is priced at the price in force when it started'
);
select is(
  (select created_at from public.ai_usage where feature = 'review'),
  '2026-12-31 23:59:50+00'::timestamptz,
  'and counts toward the month it started in'
);
select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', null, 'gemini-3.5-flash-lite', 10, 20, 1, 0) $$,
  '23514', null,
  'nor more cached tokens than input'
);

-- A's chat call is over, so another starts.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select allowed, used_usd from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (true, 0.442001::numeric) $$,
  'Once recorded, a call of the feature starts again, with what it cost counted'
);

-- A call that never recorded, as when its function crashed, stops holding its place.
set local role service_role;
create temporary table left_behind on commit drop as
  select call_id from public.ai_calls_in_flight
  where user_id = '00000000-0000-0000-0000-00000000000a';
update public.ai_calls_in_flight set started_at = now() - interval '9 minutes';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select allowed from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (false) $$,
  'A call keeps its place for ten minutes'
);

set local role service_role;
update public.ai_calls_in_flight set started_at = now() - interval '11 minutes';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select allowed from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (true) $$,
  'and gives it up after them'
);

-- The call left behind records at last, and frees only its own place.
set local role service_role;
select public.record_ai_usage(
  '00000000-0000-0000-0000-00000000000a', 'coach_chat', (select call_id from left_behind),
  'gemini-3.5-flash-lite', 0, 0, 0, 0
);
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select reason from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values ('call_in_progress'::public.ai_access_reason) $$,
  'A call that recorded late leaves the place of the call that took it over'
);

select results_eq(
  $$ select model from public.ai_usage order by id $$,
  $$ values ('gemini-3.5-flash-lite'), ('gemini-3.8-flash'), ('gemini-3.5-flash-lite') $$,
  'Users read their own usage'
);
select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', null, 'gemini-3.5-flash-lite', 0, 0, 0, 0) $$,
  '42501', null,
  'and record none themselves'
);
select throws_ok(
  $$ insert into public.ai_usage
       (user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
        thinking_tokens, cost_usd)
     values ('00000000-0000-0000-0000-00000000000a', 'coach_chat', 'x', 0, 0, 0, 0, 0) $$,
  '42501', null,
  'nor write it'
);
select throws_ok(
  $$ delete from public.ai_usage $$, '42501', null, 'nor delete it'
);
select throws_ok(
  $$ delete from public.ai_calls_in_flight $$, '42501', null, 'nor end a call themselves'
);
select throws_ok(
  $$ select 1 from public.ai_settings $$, '42501', null, 'and read no settings directly'
);
select throws_ok(
  $$ update public.ai_model_prices set output_usd = 0 $$, '42501', null, 'nor change a price'
);

-- At the limit, and in an earlier month.
set local role service_role;
insert into public.ai_usage
  (user_id, feature, model, input_tokens, cached_input_tokens, output_tokens, thinking_tokens,
   cost_usd, created_at)
  values
    ('00000000-0000-0000-0000-00000000000a', 'meal_photo', 'gemini-3.8-flash', 0, 0, 0, 0, 10,
     date_trunc('month', now(), 'UTC') - interval '1 second'),
    ('00000000-0000-0000-0000-00000000000b', 'review', 'gemini-3.8-flash', 0, 0, 0, 0, 4,
     date_trunc('month', now(), 'UTC'));

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select used_usd from public.ai_access()),
  0.442001::numeric,
  'Only the calls of this month count'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select allowed, reason, used_usd
     from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason, 4::numeric) $$,
  'A user who reached the limit starts no call'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (false, 'account_required'::public.ai_access_reason) $$,
  'nor does a guest, as AI needs an account'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000d');
select results_eq(
  $$ select allowed, reason, budget_usd
     from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (false, 'plan_required'::public.ai_access_reason, 0::numeric) $$,
  'nor a user without a budget, which is nothing by default'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  '42501', null,
  'Without signing in, no call starts'
);
select throws_ok(
  $$ select 1 from public.ai_usage $$, '42501', null, 'and there is no usage to read'
);

select * from finish();
rollback;
