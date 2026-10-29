-- What AI costs: a call is priced at the price in force when it was made, a user reads only their
-- own usage, and a call starts only for a user with an account, under the monthly limit, on a
-- priced model, and with no call of the same feature running.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true);

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
       resets_at = date_trunc('month', now(), 'UTC') + interval '1 month'
     from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (true, null::public.ai_access_reason, 4.00::numeric, 0::numeric, true) $$,
  'A user under the limit starts a call, until the month resets'
);
select results_eq(
  $$ select allowed, reason from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (false, 'call_in_progress'::public.ai_access_reason) $$,
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
-- 600,000 × $0.30 + 400,000 × $0.03 + 100,000 × $2.50, per million.
select is(
  public.record_ai_usage(
    '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'gemini-3.5-flash-lite',
    1000000, 400000, 100000, 20000
  ),
  0.442000::numeric,
  'A call costs its input, cached input and output at the model''s prices'
);
select results_eq(
  $$ select feature::text, model, input_tokens, cached_input_tokens, output_tokens,
       thinking_tokens, cost_usd
     from public.ai_usage $$,
  $$ values ('coach_chat', 'gemini-3.5-flash-lite', 1000000, 400000, 100000, 20000, 0.442000) $$,
  'and is recorded with its tokens'
);
select is(
  public.record_ai_usage(
    '00000000-0000-0000-0000-00000000000a', 'meal_photo', 'gemini-3.8-flash', 1, 0, 0, 0
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
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'unknown-model', 1, 0, 1, 0) $$,
  'BB033', null,
  'A model without a price is not recorded'
);
select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'gemini-3.5-flash-lite', 10, 20, 1, 0) $$,
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
update public.ai_calls_in_flight set started_at = now() - interval '3 minutes'
where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select allowed from public.start_ai_call('coach_chat', 'gemini-3.5-flash-lite') $$,
  $$ values (true) $$,
  'A call left behind gives its place up after two minutes'
);

select results_eq(
  $$ select model from public.ai_usage order by id $$,
  $$ values ('gemini-3.5-flash-lite'), ('gemini-3.8-flash') $$,
  'Users read their own usage'
);
select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'gemini-3.5-flash-lite', 0, 0, 0, 0) $$,
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
