-- What AI costs, and a limit on it per user and month (#288, #322, ADR 0051). A call here is one
-- request to a model. Edge Functions start each with start_ai_call(), which sets the most it may
-- cost aside from the user's budget, and record it with record_ai_usage() after it, also when it
-- failed, so that a user can never spend past their budget. Functions report tokens; only the
-- database knows prices.
--
-- New error codes:
--   BB033  no price is known for the model at the time of the call
--   BB034  no call was started with the id a record names

-- What a call is for. The Edge Functions' model interface names its tasks after these.
create type public.ai_feature as enum ('coach_chat', 'coach_voice', 'meal_photo', 'review');

-- The price of each model per million tokens, from a time on. A change of price is a new row, so
-- that past calls keep what they cost.
create table public.ai_model_prices (
  model text not null check (length(model) between 1 and 100),
  valid_from timestamptz not null,
  input_usd numeric(10, 4) not null check (input_usd >= 0),
  -- Part of the input that the provider read from its cache.
  cached_input_usd numeric(10, 4) not null check (cached_input_usd >= 0),
  -- The answer and the reasoning before it, which providers bill alike.
  output_usd numeric(10, 4) not null check (output_usd >= 0),
  primary key (model, valid_from)
);

-- The Gemini Developer API's standard prices (ai.google.dev/gemini-api/docs/pricing), as of
-- 2026-10-30. Gemini 3.8 Flash costs twice as much from 2027.
insert into public.ai_model_prices (model, valid_from, input_usd, cached_input_usd, output_usd)
values
  ('gemini-3.5-flash-lite', '2026-01-01', 0.30, 0.03, 2.50),
  ('gemini-3.8-flash', '2026-01-01', 0.75, 0.075, 3.75),
  ('gemini-3.8-flash', '2027-01-01', 1.50, 0.15, 7.50);

-- How large a call of each feature may be: the most it may send and answer, reasoning included.
-- A call that would send more is refused; its answer is cut at max_output_tokens.
create table public.ai_feature_limits (
  feature public.ai_feature primary key,
  max_input_tokens integer not null check (max_input_tokens > 0),
  max_output_tokens integer not null check (max_output_tokens > 0)
);

insert into public.ai_feature_limits (feature, max_input_tokens, max_output_tokens) values
  ('coach_chat', 32000, 2048),
  ('coach_voice', 32000, 2048),
  ('meal_photo', 8000, 1024),
  ('review', 100000, 4096);

-- What a user may spend on AI a month, set by their plan, or by hand in development. Without one,
-- nothing: AI comes with a plan.
create table public.ai_budgets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_limit_usd numeric(8, 2) not null check (monthly_limit_usd >= 0),
  updated_at timestamptz not null default now()
);

-- One row per model call, written when it is recorded, or when it is left behind.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  -- The call it records, as start_ai_call() named it.
  call_id uuid not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature public.ai_feature not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  cached_input_tokens integer not null check (cached_input_tokens between 0 and input_tokens),
  output_tokens integer not null check (output_tokens >= 0),
  -- Part of the output.
  thinking_tokens integer not null check (thinking_tokens between 0 and output_tokens),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  -- Counted at the most it could have cost, as what it used is not known: a call left behind,
  -- until it records after all, or one that broke off before its provider said.
  estimated boolean not null default false,
  -- When the call started, by which it is priced and counted toward a month.
  created_at timestamptz not null default now()
);

-- A user's calls of a month, as ai_access() sums them.
create index ai_usage_user_month_idx on public.ai_usage (user_id, created_at);

-- The calls running now, one per user and feature, each with the most it may cost, which counts
-- toward the user's budget until the call is recorded. A call that never recorded, as when its
-- function was stopped, is counted at that most after ten minutes, longer than an Edge Function
-- may run.
create table public.ai_calls_in_flight (
  call_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature public.ai_feature not null,
  -- The model it was started on, and when, by which it is priced.
  model text not null,
  started_at timestamptz not null default now(),
  reserved_usd numeric(12, 6) not null check (reserved_usd >= 0),
  unique (user_id, feature)
);

-- Users read their own usage; nobody but the service role writes it. Prices, limits, budgets and
-- the calls in flight are read only through the functions below.
alter table public.ai_model_prices enable row level security;
alter table public.ai_feature_limits enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_calls_in_flight enable row level security;

create policy "Users read their own AI usage"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_model_prices, public.ai_feature_limits, public.ai_budgets, public.ai_usage,
  public.ai_calls_in_flight from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- The price of a model in force at a time, or null when none is known.
create function public.ai_model_price(model text, at timestamptz)
returns public.ai_model_prices
language sql
stable
set search_path = ''
as $$
  select * from public.ai_model_prices p
  where p.model = ai_model_price.model and p.valid_from <= at
  order by p.valid_from desc
  limit 1;
$$;

revoke all on function public.ai_model_price(text, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_model_price(text, timestamptz) to service_role;

-- What tokens cost at a price, in dollars, to a millionth.
create function public.ai_cost(
  price public.ai_model_prices,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    (
      (input_tokens - cached_input_tokens) * price.input_usd
      + cached_input_tokens * price.cached_input_usd
      + output_tokens * price.output_usd
    ) / 1000000,
    6
  );
$$;

revoke all on function public.ai_cost(public.ai_model_prices, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ai_cost(public.ai_model_prices, integer, integer, integer)
  to service_role;

-- Why a user may not call a model now.
create type public.ai_access_reason as enum (
  -- AI needs an account; guests have none.
  'account_required',
  -- The user has no budget for AI, which a plan gives.
  'plan_required',
  -- The month's budget is used up, or too little of it is left for the call, until resets_at.
  'limit_reached',
  -- The call would send more than its feature allows.
  'request_too_large',
  -- The model has no price, so its cost could not be counted.
  'unpriced_model',
  -- A call of the same feature is still running.
  'call_in_progress'
);

-- Whether a user may call a model this month, which the app shows. It refuses only for
-- 'account_required', 'plan_required' and 'limit_reached'.
create type public.ai_access as (
  allowed boolean,
  -- Set when not allowed.
  reason public.ai_access_reason,
  budget_usd numeric,
  -- What the month's calls cost, and what the calls running now may still cost.
  used_usd numeric,
  resets_at timestamptz
);

-- What start_ai_call() says: whether the call may go ahead, and if so, under which id and where
-- its answer is cut, reasoning included.
create type public.ai_call as (
  allowed boolean,
  reason public.ai_access_reason,
  call_id uuid,
  max_output_tokens integer
);

-- The calling user's budget this month and whether it lets them call a model: the one place
-- that decides on the limit. A month is a calendar month in UTC.
create function public.ai_access()
returns public.ai_access
language plpgsql
stable
-- Reads the budgets and calls, which callers may not, and whether the user is a guest.
security definer
set search_path = ''
as $$
declare
  month_start timestamptz := date_trunc('month', now(), 'UTC');
  result public.ai_access;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  result.budget_usd := coalesce(
    (select b.monthly_limit_usd from public.ai_budgets b where b.user_id = (select auth.uid())),
    0
  );
  result.resets_at := month_start + interval '1 month';
  result.used_usd := (
    select coalesce(sum(u.cost_usd), 0) from public.ai_usage u
    where u.user_id = (select auth.uid()) and u.created_at >= month_start
  ) + (
    select coalesce(sum(c.reserved_usd), 0) from public.ai_calls_in_flight c
    where c.user_id = (select auth.uid())
  );

  if (select u.is_anonymous from auth.users u where u.id = (select auth.uid())) then
    result.reason := 'account_required';
  elsif result.budget_usd = 0 then
    result.reason := 'plan_required';
  elsif result.used_usd >= result.budget_usd then
    result.reason := 'limit_reached';
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.ai_access() from public, anon;
grant execute on function public.ai_access() to authenticated;

-- Starts a call of a model for the calling user, which sends `input_tokens`, and sets the most it
-- may cost aside from their budget: when ai_access() allows it, the call sends no more than its
-- feature allows, the model has a price, enough budget is left for the call, and no call of the
-- same feature is running. Edge Functions call it with the user's token before each request to
-- the model, cut the answer at max_output_tokens, and end the call with record_ai_usage().
create function public.start_ai_call(
  feature public.ai_feature,
  model text,
  input_tokens integer
)
returns public.ai_call
language plpgsql
-- Writes the calls in flight and usage, which callers may not.
security definer
set search_path = ''
as $$
declare
  limits public.ai_feature_limits;
  price public.ai_model_prices;
  reserved numeric;
  access public.ai_access;
  result public.ai_call;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if input_tokens is null or input_tokens < 0 then
    raise exception 'input_tokens must be a count' using errcode = '22023';
  end if;

  -- One start at a time per user, so that each one sees what the one before set aside.
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text, 0));

  -- Calls left behind are counted at their most now, which frees their places.
  perform public.record_ai_usage(c.call_id, 0, 0, 0, 0, known => false)
  from public.ai_calls_in_flight c
  where c.user_id = (select auth.uid()) and c.started_at < now() - interval '10 minutes';

  access := public.ai_access();
  result.reason := access.reason;
  if access.allowed then
    select * into limits from public.ai_feature_limits l where l.feature = start_ai_call.feature;
    price := public.ai_model_price(model, now());
    if input_tokens > limits.max_input_tokens then
      result.reason := 'request_too_large';
    elsif price is null then
      result.reason := 'unpriced_model';
    elsif exists (
      select 1 from public.ai_calls_in_flight c
      where c.user_id = (select auth.uid()) and c.feature = start_ai_call.feature
    ) then
      result.reason := 'call_in_progress';
    else
      reserved := public.ai_cost(price, input_tokens, 0, limits.max_output_tokens);
      if access.used_usd + reserved > access.budget_usd then
        result.reason := 'limit_reached';
      else
        insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd)
        values ((select auth.uid()), start_ai_call.feature, start_ai_call.model, reserved)
        returning call_id into result.call_id;
        result.max_output_tokens := limits.max_output_tokens;
      end if;
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.start_ai_call(public.ai_feature, text, integer) from public, anon;
grant execute on function public.start_ai_call(public.ai_feature, text, integer) to authenticated;

-- Records a call start_ai_call() started, with the tokens it used, and returns what it cost.
-- The call is priced by the model it was started on, at the price in force when it started, and
-- counts toward that month. When what it used is not `known`, as when its answer broke off
-- before the provider said, or it was left behind, it is counted at the most it could have cost;
-- a call left behind that records after all replaces that with what it did cost. Edge Functions
-- call it after every call they started, also when it failed; only they may, with the service
-- role.
create function public.record_ai_usage(
  call_id uuid,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  thinking_tokens integer,
  known boolean default true
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  started public.ai_calls_in_flight;
  price public.ai_model_prices;
  cost numeric;
begin
  delete from public.ai_calls_in_flight c where c.call_id = record_ai_usage.call_id
  returning * into started;
  if not found then
    -- Left behind, and counted at its most already.
    select u.call_id, u.user_id, u.feature, u.model, u.created_at, u.cost_usd
    into started.call_id, started.user_id, started.feature, started.model, started.started_at,
      started.reserved_usd
    from public.ai_usage u
    where u.call_id = record_ai_usage.call_id and u.estimated
    for update;
    if not found then
      raise exception 'No call % was started, or it was recorded already', call_id
        using errcode = 'BB034';
    end if;
  end if;

  price := public.ai_model_price(started.model, started.started_at);
  if price is null then
    raise exception 'No price is known for model %', started.model using errcode = 'BB033';
  end if;
  cost := case
    when known then public.ai_cost(price, input_tokens, cached_input_tokens, output_tokens)
    else started.reserved_usd
  end;

  insert into public.ai_usage (
    call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
    thinking_tokens, cost_usd, estimated, created_at
  )
  values (
    started.call_id, started.user_id, started.feature, started.model, input_tokens,
    cached_input_tokens, output_tokens, thinking_tokens, cost, not known, started.started_at
  )
  on conflict on constraint ai_usage_call_id_key do update set
    input_tokens = excluded.input_tokens,
    cached_input_tokens = excluded.cached_input_tokens,
    output_tokens = excluded.output_tokens,
    thinking_tokens = excluded.thinking_tokens,
    cost_usd = excluded.cost_usd,
    estimated = excluded.estimated;
  return cost;
end;
$$;

revoke all on function public.record_ai_usage(uuid, integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, integer, integer, integer, integer, boolean)
  to service_role;
