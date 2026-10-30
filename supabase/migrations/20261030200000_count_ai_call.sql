-- A call's input is counted after its place is taken (#329, ADR 0056). aiModel() starts a call
-- with no input, which takes the user's one place for the feature before anything goes to the
-- provider, then counts what it sends with the provider and gives the count here, which checks
-- it against the feature's limit and the budget, as start_ai_call() checks a count it is given.
-- So one user's parallel requests stop at call_in_progress before they reach the provider.

-- Sets the input a call started with start_ai_call() sends, and what it may cost with it: when
-- the call sends no more than its feature allows and the budget has room for it. A call refused
-- here gives its place up, as it never reached the model.
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

  -- As start_ai_call(), so that each sees what the other set aside.
  perform pg_advisory_xact_lock(hashtextextended('ai_calls ' || (select auth.uid())::text, 0));

  select * into started from public.ai_calls_in_flight c
  where c.call_id = count_ai_call.call_id and c.user_id = (select auth.uid());
  if not found then
    raise exception 'No call % in flight', count_ai_call.call_id using errcode = 'P0002';
  end if;

  select * into limits from public.ai_feature_limits l where l.feature = started.feature;
  reserved := public.ai_cost(
    public.ai_model_price(started.model, started.started_at), input_tokens, 0,
    limits.max_output_tokens
  );
  -- What the user has used, this call's place as it was set aside without its input.
  access := public.ai_access();
  if input_tokens > limits.max_input_tokens then
    result.reason := 'request_too_large';
  elsif access.used_usd - started.reserved_usd + reserved > access.budget_usd then
    result.reason := 'limit_reached';
  end if;

  if result.reason is null then
    update public.ai_calls_in_flight c set reserved_usd = reserved
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
