-- A call's input is counted after its place is taken: count_ai_call() sets what the call sends,
-- checks it against the feature's limit and the budget, and gives the place up when it refuses.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', false),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', false);

-- A and B are premium, with $4 a month; B has two cents of it left.
insert into public.subscriptions (user_id, plan, period_start, period_end, billing, source)
select id, 'premium', now() - interval '1 day', now() + interval '29 days', 'monthly', 'manual'
from auth.users where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.ai_usage
  (call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
   thinking_tokens, cost_usd)
values
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', 'review', 'gemini-3.8-flash',
   0, 0, 0, 0, 3.98);

-- A model whose price never changes, so that what these calls cost holds on any day.
insert into public.ai_model_prices (model, valid_from, input_usd, cached_input_usd, output_usd)
values ('test-flash', '2000-01-01', 0.75, 0.075, 3.75);

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

create temporary table calls (name text primary key, call_id uuid) on commit drop;
grant select, insert on calls to authenticated;

-- A's chat takes its place with no input: only the most it may answer, 2,048 tokens at $3.75 per
-- million, is set aside.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');
insert into calls select 'chat', call_id from public.start_ai_call('coach_chat', 'test-flash', 0);
select is((select used_usd from public.ai_access()), 0.007680::numeric, 'A place is taken with no input');

-- Counted at 32,000 tokens, the most chat allows: 32,000 × $0.75 per million more is set aside.
select results_eq(
  $$ select allowed, max_output_tokens from public.count_ai_call((select call_id from calls where name = 'chat'), 32000) $$,
  $$ values (true, 2048) $$,
  'A count within the limit and the budget goes on'
);
select is((select used_usd from public.ai_access()), 0.031680::numeric, 'and sets aside what the call may cost with it');

-- A call is counted once.
select throws_ok(
  $$ select public.count_ai_call((select call_id from calls where name = 'chat'), 0) $$,
  'P0002',
  null,
  'A call counted already cannot be counted again'
);

-- A count over the limit gives the place up.
insert into calls select 'long', call_id from public.start_ai_call('coach_voice', 'test-flash', 0);
select results_eq(
  $$ select allowed, reason::text from public.count_ai_call((select call_id from calls where name = 'long'), 32001) $$,
  $$ values (false, 'request_too_large') $$,
  'A count over the limit is refused'
);
select ok(
  (select allowed from public.start_ai_call('coach_voice', 'test-flash', 0)),
  'and its place is free again'
);

-- B's two cents hold the answer, not the answer and 32,000 tokens.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
insert into calls select 'b', call_id from public.start_ai_call('coach_chat', 'test-flash', 0);
select results_eq(
  $$ select allowed, reason::text from public.count_ai_call((select call_id from calls where name = 'b'), 32000) $$,
  $$ values (false, 'limit_reached') $$,
  'A count the budget cannot hold is refused'
);

-- A call is counted only by its user.
select throws_ok(
  $$ select public.count_ai_call((select call_id from calls where name = 'chat'), 10) $$,
  'P0002',
  null,
  'Another user''s call cannot be counted'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.count_ai_call(uuid, integer)', 'execute'),
  'Signed-out callers may not count a call'
);

select * from finish();
rollback;
