-- What AI costs, and a limit on it per user and month (#288, ADR 0051). Every Edge Function that
-- calls a model starts the call with start_ai_call() and records it with record_ai_usage() after
-- it, also when it failed, so that one user can never run up an unbounded bill. Functions report
-- tokens; only the database knows prices.
--
-- New error codes:
--   BB033  no price is known for the model at the time of the call

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

-- One row per model call.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature public.ai_feature not null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  cached_input_tokens integer not null check (cached_input_tokens between 0 and input_tokens),
  output_tokens integer not null check (output_tokens >= 0),
  -- Part of the output.
  thinking_tokens integer not null check (thinking_tokens between 0 and output_tokens),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);

-- A user's calls of a month, as ai_access() sums them.
create index ai_usage_user_month_idx on public.ai_usage (user_id, created_at);

-- The calls running now, one per user and feature, so that requests sent at once cannot all pass
-- the limit before the first is recorded. A call that never recorded, as when its function
-- crashed, stops holding its place after ten minutes, longer than an Edge Function may run.
create table public.ai_calls_in_flight (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature public.ai_feature not null,
  -- The call holding the place, which only it frees.
  call_id uuid not null default gen_random_uuid(),
  -- The model it was started on, and when, by which it is priced when it is recorded.
  model text not null,
  started_at timestamptz not null default now(),
  primary key (user_id, feature)
);

-- Users read their own usage; nobody but the service role writes it. Prices, settings, budgets
-- and the calls in flight are read only through the functions below.
alter table public.ai_model_prices enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_calls_in_flight enable row level security;

create policy "Users read their own AI usage"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_model_prices, public.ai_settings, public.ai_budgets, public.ai_usage,
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

-- Why a user may not call a model now.
create type public.ai_access_reason as enum (
  -- AI needs an account; guests have none.
  'account_required',
  -- The user has no budget for AI, which a plan gives.
  'plan_required',
  -- The month's budget is used up, until resets_at.
  'limit_reached',
  -- The model has no price, so its cost could not be counted.
  'unpriced_model',
  -- A call of the same feature is still running.
  'call_in_progress'
);

-- What ai_access() says, and start_ai_call() with it. The app reads ai_access(), which never
-- refuses for 'unpriced_model' or 'call_in_progress' and never sets call_id: those are
-- start_ai_call()'s.
create type public.ai_access as (
  allowed boolean,
  -- Set when not allowed.
  reason public.ai_access_reason,
  budget_usd numeric,
  used_usd numeric,
  resets_at timestamptz,
  -- The call start_ai_call() started, which record_ai_usage() ends.
  call_id uuid
);

-- The calling user's budget this month and whether it lets them call a model: the one place
-- that decides on the limit. A month is a calendar month in UTC.
create function public.ai_access()
returns public.ai_access
language plpgsql
stable
-- Reads the settings and budgets, which callers may not, and whether the user is a guest.
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

  select coalesce(
    (select b.monthly_limit_usd from public.ai_budgets b where b.user_id = (select auth.uid())),
    (select s.default_monthly_limit_usd from public.ai_settings s)
  ) into result.budget_usd;
  result.resets_at := month_start + interval '1 month';
  select coalesce(sum(u.cost_usd), 0) into result.used_usd
  from public.ai_usage u
  where u.user_id = (select auth.uid()) and u.created_at >= month_start;

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

-- Starts a call of a model for the calling user, when ai_access() allows it, the model has a
-- price and no call of the same feature is running. Edge Functions call it with the user's token
-- before the model, and record_ai_usage() ends the call.
create function public.start_ai_call(feature public.ai_feature, model text)
returns public.ai_access
language plpgsql
-- Writes the calls in flight, which callers may not.
security definer
set search_path = ''
as $$
declare
  result public.ai_access := public.ai_access();
begin
  if not result.allowed then
    return result;
  end if;

  if public.ai_model_price(model, now()) is null then
    result.reason := 'unpriced_model';
  else
    -- Takes the place, or a place a call left behind; a call holding it keeps it.
    insert into public.ai_calls_in_flight (user_id, feature, model)
    values ((select auth.uid()), start_ai_call.feature, start_ai_call.model)
    on conflict on constraint ai_calls_in_flight_pkey do update
      set call_id = gen_random_uuid(), model = excluded.model, started_at = now()
      where public.ai_calls_in_flight.started_at < now() - interval '10 minutes'
    returning public.ai_calls_in_flight.call_id into result.call_id;
    if not found then
      result.reason := 'call_in_progress';
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.start_ai_call(public.ai_feature, text) from public, anon;
grant execute on function public.start_ai_call(public.ai_feature, text) to authenticated;

-- Records a call of a model, ends it, and returns what it cost. Edge Functions call it after
-- every call they started, also when it failed, with the tokens it used and the call_id
-- start_ai_call() gave. The call is priced by the model it was started on, at the price in force
-- when it started, and counts toward that month; `model` and now() only stand in for a call that
-- held its place so long that another took it over. Only Edge Functions may, with the service
-- role.
create function public.record_ai_usage(
  user_id uuid,
  feature public.ai_feature,
  call_id uuid,
  model text,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  thinking_tokens integer
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  started public.ai_calls_in_flight;
  priced_model text;
  at timestamptz;
  price public.ai_model_prices;
  cost numeric;
begin
  select * into started from public.ai_calls_in_flight c where c.call_id = record_ai_usage.call_id;
  priced_model := coalesce(started.model, record_ai_usage.model);
  at := coalesce(started.started_at, now());
  price := public.ai_model_price(priced_model, at);
  if price is null then
    raise exception 'No price is known for model %', priced_model using errcode = 'BB033';
  end if;

  insert into public.ai_usage (
    user_id, feature, model, input_tokens, cached_input_tokens, output_tokens, thinking_tokens,
    cost_usd, created_at
  )
  values (
    record_ai_usage.user_id, feature, priced_model, input_tokens, cached_input_tokens,
    output_tokens, thinking_tokens,
    (
      (input_tokens - cached_input_tokens) * price.input_usd
      + cached_input_tokens * price.cached_input_usd
      + output_tokens * price.output_usd
    ) / 1000000,
    at
  )
  returning cost_usd into cost;

  -- Only its own place: a place it held too long may be another call's now.
  delete from public.ai_calls_in_flight c where c.call_id = record_ai_usage.call_id;
  return cost;
end;
$$;

revoke all on function public.record_ai_usage(uuid, public.ai_feature, uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, public.ai_feature, uuid, text, integer, integer, integer, integer)
  to service_role;
