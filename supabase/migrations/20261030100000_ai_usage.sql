-- What AI costs, and a limit on it per user and month (#288, ADR 0051). Every Edge Function that
-- calls a model asks ai_access() first and records the call with record_ai_usage() after it, so
-- that one user can never run up an unbounded bill. Functions report tokens; only the database
-- knows prices.
--
-- New error codes:
--   BB033  no price is known for the model at the time of the call

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

-- One row: the settings every user's AI calls share. The limit will come from the user's plan
-- once the AI features are premium; then only ai_access() changes.
create table public.ai_settings (
  id boolean primary key default true check (id),
  monthly_limit_usd numeric(8, 2) not null check (monthly_limit_usd >= 0)
);

insert into public.ai_settings (monthly_limit_usd) values (4);

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

-- Users read their own usage; nobody but the service role writes it. Prices and settings are
-- read only through the functions below.
alter table public.ai_model_prices enable row level security;
alter table public.ai_settings enable row level security;
alter table public.ai_usage enable row level security;

create policy "Users read their own AI usage"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ai_model_prices, public.ai_settings, public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- Records a call of a model and returns what it cost, at the price in force when it was made.
-- Only Edge Functions call it, with the service role.
create function public.record_ai_usage(
  user_id uuid,
  feature public.ai_feature,
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
  price public.ai_model_prices;
  cost numeric;
begin
  select * into price from public.ai_model_prices p
  where p.model = record_ai_usage.model and p.valid_from <= now()
  order by p.valid_from desc
  limit 1;
  if not found then
    raise exception 'No price is known for model %', model using errcode = 'BB033';
  end if;

  cost := (
    (input_tokens - cached_input_tokens) * price.input_usd
    + cached_input_tokens * price.cached_input_usd
    + output_tokens * price.output_usd
  ) / 1000000;

  insert into public.ai_usage (
    user_id, feature, model, input_tokens, cached_input_tokens, output_tokens, thinking_tokens,
    cost_usd
  )
  values (
    record_ai_usage.user_id, feature, model, input_tokens, cached_input_tokens, output_tokens,
    thinking_tokens, cost
  );
  return cost;
end;
$$;

revoke all on function public.record_ai_usage(uuid, public.ai_feature, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, public.ai_feature, text, integer, integer, integer, integer)
  to service_role;

-- Whether the calling user may call a model now: the one place that decides. A month is a
-- calendar month in UTC. Guests may not, as AI needs an account; a user over the limit may not
-- until the month resets. Two calls at the same moment may go a little over, which is accepted.
create type public.ai_access as (
  allowed boolean,
  -- 'account_required' or 'limit_reached' when not allowed.
  reason text,
  budget_usd numeric,
  used_usd numeric,
  resets_at timestamptz
);

create function public.ai_access()
returns public.ai_access
language plpgsql
stable
-- Reads the settings, which callers may not, and whether the user is a guest.
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

  select s.monthly_limit_usd into result.budget_usd from public.ai_settings s;
  result.resets_at := month_start + interval '1 month';
  select coalesce(sum(u.cost_usd), 0) into result.used_usd
  from public.ai_usage u
  where u.user_id = (select auth.uid()) and u.created_at >= month_start;

  if (select u.is_anonymous from auth.users u where u.id = (select auth.uid())) then
    result.reason := 'account_required';
  elsif result.used_usd >= result.budget_usd then
    result.reason := 'limit_reached';
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.ai_access() from public, anon;
grant execute on function public.ai_access() to authenticated;
