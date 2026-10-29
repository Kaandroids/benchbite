-- What AI costs, and a limit on it per user and month (#288, #322, ADR 0051). Every Edge Function
-- that calls a model starts the call with start_ai_call(), which sets the most it may cost aside
-- from the user's budget, and records it with record_ai_usage() after it, also when it failed,
-- so that a user can never spend past their budget. Functions report tokens; only the database
-- knows prices.
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
-- A call's answer is cut at max_output_tokens; the most it may cost, set aside when it starts,
-- is worked out from both.
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

-- One row: the settings every user's AI calls share. A user without a budget of their own has
-- the default, which is nothing: AI comes with a plan, which sets a budget (ai_budgets).
create table public.ai_settings (
  id boolean primary key default true check (id),
  default_monthly_limit_usd numeric(8, 2) not null check (default_monthly_limit_usd >= 0)
);

insert into public.ai_settings (default_monthly_limit_usd) values (0);

-- What a user may spend on AI a month, set by their plan, or by hand in development.
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
-- function was stopped, gives its place up after ten minutes, longer than an Edge Function may
-- run, and is counted as left behind.
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

-- Users read their own usage; nobody but the service role writes it. Prices, limits, settings,
-- budgets and the calls in flight are read only through the functions below.
alter table public.ai_model_prices enable row level security;
alter table public.ai_feature_limits enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_calls_in_flight enable row level security;

create policy "Users read their own AI usage"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_model_prices, public.ai_feature_limits, public.ai_settings,
  public.ai_budgets, public.ai_usage, public.ai_calls_in_flight from anon, authenticated;
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
  -- The model has no price, so its cost could not be counted.
  'unpriced_model',
  -- A call of the same feature is still running.
  'call_in_progress'
);

-- What ai_access() says, and start_ai_call() with it. The app reads ai_access(), which never
-- refuses for 'unpriced_model' or 'call_in_progress' and sets neither call_id nor
-- max_output_tokens: those are start_ai_call()'s.
create type public.ai_access as (
  allowed boolean,
  -- Set when not allowed.
  reason public.ai_access_reason,
  budget_usd numeric,
  -- What the month's calls cost, and what the calls running now may still cost.
  used_usd numeric,
  resets_at timestamptz,
  -- The call start_ai_call() started, which record_ai_usage() ends.
  call_id uuid,
  -- Where the call's answer is cut, reasoning included.
  max_output_tokens integer
);

-- The calling user's budget this month and whether it lets them call a model: the one place
-- that decides on the limit. A month is a calendar month in UTC.
create function public.ai_access()
returns public.ai_access
language plpgsql
stable
-- Reads the settings, budgets and calls, which callers may not, and whether the user is a guest.
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

  -- Nothing without a budget, also if the settings were ever lost.
  result.budget_usd := coalesce(
    (select b.monthly_limit_usd from public.ai_budgets b where b.user_id = (select auth.uid())),
    (select s.default_monthly_limit_usd from public.ai_settings s),
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

-- Counts a call left behind at the most it could have cost, and frees its place.
create function public.abandon_ai_call(held public.ai_calls_in_flight)
returns void
language sql
set search_path = ''
as $$
  insert into public.ai_usage (
    call_id, user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
    thinking_tokens, cost_usd, estimated, created_at
  )
  values (
    held.call_id, held.user_id, held.feature, held.model, 0, 0, 0, 0, held.reserved_usd, true,
    held.started_at
  );
  delete from public.ai_calls_in_flight c where c.call_id = held.call_id;
$$;

revoke all on function public.abandon_ai_call(public.ai_calls_in_flight)
  from public, anon, authenticated;

-- Starts a call of a model for the calling user and sets the most it may cost aside from their
-- budget: when ai_access() allows it, the model has a price, enough budget is left for the call,
-- and no call of the same feature is running. Edge Functions call it with the user's token
-- before the model, cut the answer at max_output_tokens, and end the call with
-- record_ai_usage().
create function public.start_ai_call(feature public.ai_feature, model text)
returns public.ai_access
language plpgsql
-- Writes the calls in flight and usage, which callers may not.
security definer
set search_path = ''
as $$
declare
  limits public.ai_feature_limits;
  price public.ai_model_prices;
  reserved numeric;
  held public.ai_calls_in_flight;
  result public.ai_access;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- One start at a time per user, so that each one sees what the one before set aside.
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text, 0));

  -- A call of the feature left behind is counted now, so that its place can be taken.
  select * into held from public.ai_calls_in_flight c
  where c.user_id = (select auth.uid()) and c.feature = start_ai_call.feature;
  if found and held.started_at < now() - interval '10 minutes' then
    perform public.abandon_ai_call(held);
    held := null;
  end if;

  result := public.ai_access();
  if not result.allowed then
    return result;
  end if;

  select * into limits from public.ai_feature_limits l where l.feature = start_ai_call.feature;
  price := public.ai_model_price(model, now());
  if price is null then
    result.reason := 'unpriced_model';
  elsif held.call_id is not null then
    result.reason := 'call_in_progress';
  else
    reserved := public.ai_cost(price, limits.max_input_tokens, 0, limits.max_output_tokens);
    if result.used_usd + reserved > result.budget_usd then
      result.reason := 'limit_reached';
    else
      insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd)
      values ((select auth.uid()), start_ai_call.feature, start_ai_call.model, reserved)
      returning call_id into result.call_id;
      result.max_output_tokens := limits.max_output_tokens;
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.start_ai_call(public.ai_feature, text) from public, anon;
grant execute on function public.start_ai_call(public.ai_feature, text) to authenticated;

-- Records a call start_ai_call() started, with the tokens it used, and returns what it cost.
-- The call is priced by the model it was started on, at the price in force when it started, and
-- counts toward that month. When what it used is not `known`, as when its answer broke off
-- before the provider said, it is counted at the most it could have cost. A call left behind
-- that records after all replaces that with what it did cost. Edge Functions call it after every
-- call they started, also when it failed; only they may, with the service role.
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
