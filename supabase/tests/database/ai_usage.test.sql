-- What AI costs: a call starts only for a user with an account and a budget, on a priced model,
-- with no call of the same feature running, and with enough budget left for the most it may
-- cost, which counts until it is recorded. It is priced by the model and at the price it started
-- on; a call left behind is counted at the most it could have cost. Users read only their own
-- usage and write none of it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(55);

-- A meal photo's estimate of up to twelve items fits in its answer (ADR 0059).
select is(
  (select max_output_tokens from public.ai_feature_limits where feature = 'meal_photo'),
  3000,
  'a meal photo may answer in 3,000 tokens'
);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com', false);

-- A and B have a plan's budget; D has none.
insert into public.ai_budgets (user_id, monthly_limit_usd) values
  ('00000000-0000-0000-0000-00000000000a', 4),
  ('00000000-0000-0000-0000-00000000000b', 0.02);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- A model whose price never changes, so that what these calls cost holds on any day.
insert into public.ai_model_prices (model, valid_from, input_usd, cached_input_usd, output_usd)
values ('test-flash', '2000-01-01', 0.75, 0.075, 3.75);

create temporary table calls (name text primary key, call_id uuid) on commit drop;
grant select, insert, update on calls to authenticated, service_role;

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

-- A chat call of A's, sending 32,000 tokens, the most chat allows, on Flash-Lite: with the most
-- it may answer, 2,048 tokens, 32,000 × $0.30 + 2,048 × $2.50, per million, is set aside.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

insert into calls select 'chat', call_id
  from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000);
select ok((select call_id from calls where name = 'chat') is not null, 'A user with a budget starts a call');
select results_eq(
  $$ select budget_usd, used_usd, resets_at = date_trunc('month', now(), 'UTC') + interval '1 month'
     from public.ai_access() $$,
  $$ values (4.00::numeric, 0.014720::numeric, true) $$,
  'which sets the most it may cost aside from the month''s budget'
);
select results_eq(
  $$ select allowed, reason, call_id, max_output_tokens
     from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values (false, 'call_in_progress'::public.ai_access_reason, null::uuid, null::integer) $$,
  'A second call of the same feature does not start while the first runs'
);
insert into calls select 'meal', call_id
  from public.start_ai_call('meal_photo', 'test-flash', 8000);
select ok((select call_id from calls where name = 'meal') is not null, 'A call of another feature does');
select results_eq(
  $$ select max_output_tokens from public.start_ai_call('review', 'test-flash', 100000) $$,
  $$ values (4096) $$,
  'and says where its answer is cut'
);
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_voice', 'unknown-model', 10) $$,
  $$ values (false, 'unpriced_model'::public.ai_access_reason) $$,
  'A model without a price does not start'
);
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_voice', 'gemini-3.5-flash-lite', 32001) $$,
  $$ values (false, 'request_too_large'::public.ai_access_reason) $$,
  'nor a call that sends more than its feature allows'
);
select results_eq(
  $$ select allowed from public.start_ai_call('coach_voice', 'gemini-3.5-flash-lite', 0) $$,
  $$ values (true) $$,
  'A small call sets aside little'
);
select is(
  (select used_usd from public.ai_access()),
  -- Chat, the meal photo, the review and this one.
  0.014720 + 0.017250 + 0.090360 + 0.005120,
  'only the most it may answer'
);

-- B's budget of $0.02 holds one chat call's most, not two.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select allowed from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values (true) $$,
  'A call starts while the budget left holds the most it may cost'
);
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_voice', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason) $$,
  'and another does not when what is set aside leaves too little'
);

-- The chat function records A's chat call: 1,000,000 input tokens, 400,000 of them cached, and
-- 100,000 output tokens: 600,000 × $0.30 + 400,000 × $0.03 + 100,000 × $2.50, per million.
set local role service_role;

select is(
  public.record_ai_usage((select call_id from calls where name = 'chat'), 1000000, 400000, 100000, 20000),
  0.442000::numeric,
  'A call costs its input, cached input and output at the prices of the model it started on'
);
select results_eq(
  $$ select u.user_id, feature::text, model, input_tokens, cached_input_tokens, output_tokens,
       thinking_tokens, cost_usd, estimated
     from public.ai_usage u join calls c on c.call_id = u.call_id where c.name = 'chat' $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'coach_chat', 'gemini-3.5-flash-lite',
       1000000, 400000, 100000, 20000, 0.442000, false) $$,
  'and is recorded for the user and feature it was started for'
);
select is_empty(
  $$ select 1 from public.ai_calls_in_flight c join calls k on k.call_id = c.call_id
     where k.name = 'chat' $$,
  'Recording a call frees its place'
);
select is(
  public.record_ai_usage((select call_id from calls where name = 'meal'), 1, 0, 0, 0),
  0.000001::numeric,
  'A cost is rounded up to a millionth of a dollar, and returned as it is stored'
);
select throws_ok(
  format($$ select public.record_ai_usage(%L, 1, 0, 1, 0) $$, (select call_id from calls where name = 'chat')),
  'BB034', null,
  'A call is recorded once'
);
select throws_ok(
  $$ select public.record_ai_usage(gen_random_uuid(), 1, 0, 1, 0) $$,
  'BB034', null,
  'and only a call that was started'
);
select throws_ok(
  format($$ select public.record_ai_usage(%L, 10, 20, 1, 0) $$,
    (select c.call_id from public.ai_calls_in_flight c
     where c.user_id = '00000000-0000-0000-0000-00000000000a' and c.feature = 'review')),
  '23514', null,
  'with no more cached tokens than input'
);

-- A call that started before a price change is priced, and counted, as of its start.
insert into public.ai_calls_in_flight (call_id, user_id, feature, model, started_at, reserved_usd)
values ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000000d', 'review',
  'gemini-3.8-flash', '2026-12-31 23:59:50+00', 0);
select is(
  public.record_ai_usage('00000000-0000-0000-0000-0000000000ff', 0, 0, 1000000, 0),
  3.750000::numeric,
  'A call is priced at the price in force when it started'
);
select is(
  (select created_at from public.ai_usage where call_id = '00000000-0000-0000-0000-0000000000ff'),
  '2026-12-31 23:59:50+00'::timestamptz,
  'and counts toward the month it started in'
);

-- A call whose answer broke off before Gemini said what it used is counted at its most.
select is(
  public.record_ai_usage(
    (select c.call_id from public.ai_calls_in_flight c
     where c.user_id = '00000000-0000-0000-0000-00000000000a' and c.feature = 'review'),
    0, 0, 0, 0, known => false
  ),
  0.090360::numeric,
  'A call that used it does not know what is counted at the most it could have cost'
);
select results_eq(
  $$ select estimated from public.ai_usage where feature = 'review' and model = 'test-flash'
       and user_id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values (true) $$,
  'as an estimate'
);

-- A call that never recorded keeps its place for seven minutes, then is counted at its most.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into calls select 'chat 2', call_id
  from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000);
set local role service_role;
update public.ai_calls_in_flight set started_at = now() - interval '6 minutes'
where call_id = (select call_id from calls where name = 'chat 2');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select reason from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values ('call_in_progress'::public.ai_access_reason) $$,
  'A call keeps its place for seven minutes'
);

set local role service_role;
update public.ai_calls_in_flight set started_at = now() - interval '8 minutes'
where call_id = (select call_id from calls where name = 'chat 2')
  or (user_id = '00000000-0000-0000-0000-00000000000a' and feature = 'coach_voice');
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into calls select 'chat 3', call_id
  from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000);
select ok((select call_id from calls where name = 'chat 3') is not null, 'and gives it up after them');
select results_eq(
  $$ select cost_usd, estimated from public.ai_usage where feature = 'coach_voice' $$,
  $$ values (0.005120::numeric, true) $$,
  'A start counts every call of the user''s left behind, of any feature'
);

set local role service_role;
select results_eq(
  $$ select cost_usd, estimated from public.ai_usage
     where call_id = (select call_id from calls where name = 'chat 2') $$,
  $$ values (0.014720::numeric, true) $$,
  'A call left behind is counted at the most it could have cost'
);
select is(
  public.record_ai_usage((select call_id from calls where name = 'chat 2'), 1000, 0, 100, 0),
  0.000550::numeric,
  'and when it records after all, at what it did cost'
);
select results_eq(
  $$ select cost_usd, estimated from public.ai_usage
     where call_id = (select call_id from calls where name = 'chat 2') $$,
  $$ values (0.000550::numeric, false) $$,
  'which replaces the most it was counted at'
);
select ok(
  exists (select 1 from public.ai_calls_in_flight
          where call_id = (select call_id from calls where name = 'chat 3')),
  'leaving the place of the call that took it over'
);

-- What users may do.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select feature::text from public.ai_usage order by id $$,
  $$ values ('coach_chat'), ('meal_photo'), ('review'), ('coach_voice'), ('coach_chat') $$,
  'Users read their own usage'
);
select throws_ok(
  format($$ select public.record_ai_usage(%L, 0, 0, 0, 0) $$, (select call_id from calls where name = 'chat 3')),
  '42501', null,
  'and record none themselves'
);
select throws_ok(
  $$ insert into public.ai_usage
       (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
        thinking_tokens, cost_usd)
     values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'x', 0, 0, 0, 0, 0) $$,
  '42501', null,
  'nor write it'
);
select throws_ok(
  $$ delete from public.ai_usage $$, '42501', null, 'nor delete it'
);
select throws_ok(
  $$ insert into public.ai_budgets (user_id, monthly_limit_usd)
     values ('00000000-0000-0000-0000-00000000000d', 1000) $$,
  '42501', null,
  'nor give themselves a budget'
);
select throws_ok(
  $$ update public.ai_budgets set monthly_limit_usd = 1000 $$,
  '42501', null,
  'nor raise one'
);
select throws_ok(
  $$ delete from public.ai_calls_in_flight $$, '42501', null, 'nor end a call themselves'
);
select throws_ok(
  $$ insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd)
     values ('00000000-0000-0000-0000-00000000000a', 'coach_voice', 'gemini-3.5-flash-lite', 0) $$,
  '42501', null,
  'nor start one without its cost set aside'
);
select throws_ok(
  $$ update public.ai_feature_limits set max_output_tokens = 1000000 $$,
  '42501', null,
  'nor make calls larger'
);
select throws_ok(
  $$ update public.ai_model_prices set output_usd = 0 $$, '42501', null, 'nor change a price'
);
select throws_ok(
  $$ select 1 from public.ai_budgets $$, '42501', null, 'nor read anyone''s budget'
);
select throws_ok(
  $$ select 1 from public.ai_calls_in_flight $$, '42501', null, 'nor the calls running'
);
select throws_ok(
  $$ select 1 from public.ai_model_prices $$, '42501', null, 'nor the prices'
);
select throws_ok(
  $$ select public.ai_model_price('gemini-3.8-flash', now()) $$, '42501', null,
  'nor look one up'
);
select throws_ok(
  $$ select public.ai_cost(public.ai_model_price('gemini-3.8-flash', now()), 1, 0, 1) $$,
  '42501', null,
  'nor price tokens'
);

-- An earlier month, the limit, guests, users without a budget, and lost settings.
set local role service_role;
delete from public.ai_calls_in_flight;
insert into public.ai_usage
  (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
   thinking_tokens, cost_usd, created_at)
  values
    (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'meal_photo', 'gemini-3.8-flash',
     0, 0, 0, 0, 10, date_trunc('month', now(), 'UTC') - interval '1 second'),
    (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'review', 'gemini-3.8-flash',
     0, 0, 0, 0, 0.02, date_trunc('month', now(), 'UTC'));

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
select is(
  (select used_usd from public.ai_access()),
  0.538031::numeric,
  'Only the calls of this month count'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select allowed, reason from public.ai_access() $$,
  $$ values (false, 'limit_reached'::public.ai_access_reason) $$,
  'A user who used the budget up may call no model'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  $$ values (false, 'account_required'::public.ai_access_reason) $$,
  'nor does a guest, as AI needs an account'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000d');
select results_eq(
  $$ select allowed, reason, budget_usd from public.ai_access() $$,
  $$ values (false, 'plan_required'::public.ai_access_reason, 0::numeric) $$,
  'nor a user without a budget, which is nothing by default'
);


select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite', 32000) $$,
  '42501', null,
  'Without signing in, no call starts'
);
select throws_ok(
  $$ select 1 from public.ai_usage $$, '42501', null, 'and there is no usage to read'
);
select throws_ok(
  $$ select public.ai_access() $$, '42501', null, 'nor any access'
);

select * from finish();
rollback;
