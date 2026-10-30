-- A call's input is counted after its place is taken (#329, ADR 0056). aiModel() starts a call
-- with no input, which takes the user's one place for the feature before anything goes to the
-- provider, then counts what it sends with the provider and gives the count here. So one user's
-- parallel requests stop at call_in_progress before they reach the provider. Both functions decide
-- with the one rule below.

-- Why a call may not go ahead with `input_tokens`, given what else the user has used and set
-- aside, or null when it may: too much input for the feature, a model without a price, or too
-- little budget for the call at its most.
create function public.ai_call_refusal(
  limits public.ai_feature_limits,
  price public.ai_model_prices,
  input_tokens integer,
  other_used_usd numeric,
  budget_usd numeric
)
returns public.ai_access_reason
language sql
stable
set search_path = ''
as $$
  select case
    when input_tokens > limits.max_input_tokens then 'request_too_large'
    when price is null then 'unpriced_model'
    when other_used_usd + public.ai_cost(price, input_tokens, 0, limits.max_output_tokens)
      > budget_usd then 'limit_reached'
  end::public.ai_access_reason;
$$;

revoke all on function public.ai_call_refusal(
  public.ai_feature_limits, public.ai_model_prices, integer, numeric, numeric
) from public, anon, authenticated;

-- Whether a call's input was counted; a call is counted once.
alter table public.ai_calls_in_flight add column counted boolean not null default false;

-- As before (20261030100000_ai_usage.sql), deciding with ai_call_refusal(). A call started with a
-- count is counted already.
create or replace function public.start_ai_call(
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
  perform pg_advisory_xact_lock(hashtextextended('ai_calls ' || (select auth.uid())::text, 0));

  -- Calls left behind are counted at their most now, which frees their places.
  perform public.record_ai_usage(c.call_id, 0, 0, 0, 0, known => false)
  from public.ai_calls_in_flight c
  where c.user_id = (select auth.uid()) and c.started_at < now() - interval '7 minutes';

  access := public.ai_access();
  result.reason := access.reason;
  if access.allowed then
    select * into limits from public.ai_feature_limits l where l.feature = start_ai_call.feature;
    price := public.ai_model_price(model, now());
    if exists (
      select 1 from public.ai_calls_in_flight c
      where c.user_id = (select auth.uid()) and c.feature = start_ai_call.feature
    ) then
      result.reason := 'call_in_progress';
    else
      result.reason := public.ai_call_refusal(
        limits, price, input_tokens, access.used_usd, access.budget_usd
      );
    end if;
    if result.reason is null then
      insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd, counted)
      values (
        (select auth.uid()), start_ai_call.feature, start_ai_call.model,
        public.ai_cost(price, input_tokens, 0, limits.max_output_tokens), input_tokens > 0
      )
      returning call_id into result.call_id;
      result.max_output_tokens := limits.max_output_tokens;
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

-- Sets the input a call started with no count sends, and what it may cost with it, deciding as
-- start_ai_call() does. The user's access was checked when the call started. A call refused here
-- gives its place up without a record, as it never reached the model.
create function public.count_ai_call(call_id uuid, input_tokens integer)
returns public.ai_call
language plpgsql
-- Writes the calls in flight, which callers may not.
security definer
set search_path = ''
as $$
declare
  started public.ai_calls_in_flight;
  limits public.ai_feature_limits;
  access public.ai_access;
  result public.ai_call;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if input_tokens is null or input_tokens < 0 then
    raise exception 'input_tokens must be a count' using errcode = '22023';
  end if;

  -- As start_ai_call(), so that each sees what the other set aside.
  perform pg_advisory_xact_lock(hashtextextended('ai_calls ' || (select auth.uid())::text, 0));

  select * into started from public.ai_calls_in_flight c
  where c.call_id = count_ai_call.call_id and c.user_id = (select auth.uid()) and not c.counted;
  if not found then
    raise exception 'No call % in flight to count', count_ai_call.call_id using errcode = 'P0002';
  end if;

  select * into limits from public.ai_feature_limits l where l.feature = started.feature;
  -- What else the user has used and set aside: all of it but this call's place.
  access := public.ai_access();
  result.reason := public.ai_call_refusal(
    limits, public.ai_model_price(started.model, started.started_at), input_tokens,
    access.used_usd - started.reserved_usd, access.budget_usd
  );

  if result.reason is null then
    update public.ai_calls_in_flight c
    set reserved_usd = public.ai_cost(
          public.ai_model_price(started.model, started.started_at), input_tokens, 0,
          limits.max_output_tokens
        ),
        counted = true
    where c.call_id = started.call_id;
    result.call_id := started.call_id;
    result.max_output_tokens := limits.max_output_tokens;
  else
    delete from public.ai_calls_in_flight c where c.call_id = started.call_id;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.count_ai_call(uuid, integer) from public, anon;
grant execute on function public.count_ai_call(uuid, integer) to authenticated;
