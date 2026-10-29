-- What AI costs: a call is priced at the price in force when it was made, a user reads only their
-- own usage, and ai_access() stops guests and users over the monthly limit until the month resets.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false),
  ('00000000-0000-0000-0000-00000000000c', null, true);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

-- The chat function records two calls of A's.
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

select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'unknown-model', 1, 0, 1, 0) $$,
  'BB033', null,
  'A model without a price is refused'
);
select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'gemini-3.5-flash-lite', 10, 20, 1, 0) $$,
  '23514', null,
  'as are more cached tokens than input'
);

-- The price in force: Gemini 3.8 Flash costs twice as much from 2027.
insert into public.ai_usage
  (user_id, feature, model, input_tokens, cached_input_tokens, output_tokens, thinking_tokens,
   cost_usd)
  values ('00000000-0000-0000-0000-00000000000b', 'review', 'gemini-3.8-flash', 0, 0, 0, 0, 0);
select is(
  (select output_usd from public.ai_model_prices
   where model = 'gemini-3.8-flash' and valid_from <= '2026-12-31'
   order by valid_from desc limit 1),
  3.7500::numeric,
  'A price holds until the next one starts'
);
select is(
  (select output_usd from public.ai_model_prices
   where model = 'gemini-3.8-flash' and valid_from <= '2027-01-01'
   order by valid_from desc limit 1),
  7.5000::numeric,
  'and the next one holds from its start'
);

-- A reads their usage and their access.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

select results_eq(
  $$ select model from public.ai_usage $$,
  $$ values ('gemini-3.5-flash-lite') $$,
  'Users read their own usage only'
);
select results_eq(
  $$ select allowed, reason, budget_usd, used_usd,
       resets_at = date_trunc('month', now(), 'UTC') + interval '1 month'
     from public.ai_access() $$,
  $$ values (true, null::text, 4.00::numeric, 0.442000::numeric, true) $$,
  'Under the limit a user may call a model until the month resets'
);

select throws_ok(
  $$ select public.record_ai_usage(
       '00000000-0000-0000-0000-00000000000a', 'coach_chat', 'gemini-3.5-flash-lite', 0, 0, 0, 0) $$,
  '42501', null,
  'Users record no usage themselves'
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
  $$ delete from public.ai_usage $$,
  '42501', null,
  'nor delete it'
);
select throws_ok(
  $$ select 1 from public.ai_settings $$,
  '42501', null,
  'and read no settings or prices directly'
);
select throws_ok(
  $$ update public.ai_model_prices set output_usd = 0 $$,
  '42501', null,
  'nor change them'
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
  0.442000::numeric,
  'Only the calls of this month count'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select results_eq(
  $$ select allowed, reason, used_usd from public.ai_access() $$,
  $$ values (false, 'limit_reached', 4::numeric) $$,
  'A user who reached the limit may not call a model'
);

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000c');
select results_eq(
  $$ select allowed, reason from public.ai_access() $$,
  $$ values (false, 'account_required') $$,
  'Guests may not, as AI needs an account'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$ select public.ai_access() $$, '42501', null, 'Without signing in, there is no access'
);
select throws_ok(
  $$ select 1 from public.ai_usage $$, '42501', null, 'nor any usage to read'
);

select * from finish();
rollback;
