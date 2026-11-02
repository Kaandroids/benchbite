-- AI budgets by each plan's windows (#409, ADR 0078): the trial and premium have their budget a
-- budget period and at most a week's share of it, counted from the subscription's period; a free
-- user has meals estimated from a photo, two a free week counted from when the account was made,
-- behind a small budget of what those calls did cost. One function counts the windows, and
-- ai_access(), start_ai_call() and count_ai_call() read it.

-- Whether a call was made on the free plan, which then counts toward the free week, never toward
-- a paid period; and, for a call limited by number, whether it gave what it was for: a whole
-- answer, as an estimate. Only a call that gave it counts toward the number.
alter table public.ai_calls_in_flight add column free boolean not null default false;
alter table public.ai_usage add column free boolean not null default false;
alter table public.ai_usage add column given boolean;

-- What ai_access() says beside the budget: whether the feature is limited by number on the
-- caller's plan, and how many are left.
alter type public.ai_access add attribute by_count boolean;
alter type public.ai_access add attribute left_count integer;

-- How long a plan lasts past its period: a renewal reaches us a little after the store makes it,
-- and in between the plan should not end. plan_of() and the windows both read it.
create function public.plan_grace()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '1 hour';
$$;

-- As before (20261102210000_plans_and_subscriptions.sql), with the grace from plan_grace().
create or replace function public.plan_of(user_id uuid)
returns public.plan
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select s.plan from public.subscriptions s
      where s.user_id = plan_of.user_id
        and now() >= s.period_start
        and now() < s.period_end + public.plan_grace()
    ),
    'free'
  );
$$;

-- The feature the free plan counts by number: meals estimated from a photo.
create function public.ai_counted_feature()
returns public.ai_feature
language sql
immutable
set search_path = ''
as $$
  select 'meal_photo'::public.ai_feature;
$$;

-- The budget period of a subscription from `starts` to `ends`, billed `billing`, at `at`: the
-- billing period itself when monthly, and a month of it when yearly, month n starting n months
-- after `starts` on the same day, or on the month's last day when it has fewer.
create function public.budget_period(
  starts timestamptz,
  ends timestamptz,
  billing public.billing_period,
  at timestamptz
)
returns tstzrange
language plpgsql
immutable
set search_path = ''
as $$
declare
  months integer;
begin
  if billing = 'monthly' then
    return tstzrange(starts, ends);
  end if;
  months := (extract(year from age(at, starts)) * 12 + extract(month from age(at, starts)))::integer;
  -- age() and adding months clamp month ends differently; settle on the months added.
  while starts + make_interval(months => months + 1) <= at loop
    months := months + 1;
  end loop;
  while months > 0 and starts + make_interval(months => months) > at loop
    months := months - 1;
  end loop;
  return tstzrange(
    starts + make_interval(months => months),
    least(starts + make_interval(months => months + 1), ends)
  );
end;
$$;

-- The 7-day step of `period` that holds `at`, cut at the period's end.
create function public.week_of(period tstzrange, at timestamptz)
returns tstzrange
language sql
immutable
set search_path = ''
as $$
  select tstzrange(
    date_bin(interval '7 days', at, lower(period)),
    least(
      date_bin(interval '7 days', at, lower(period)) + interval '7 days',
      coalesce(upper(period), 'infinity')
    )
  );
$$;

-- `span`, widened by the grace a plan lasts past its period when it ends with the period, so that
-- what is used in the grace counts toward it.
create function public.with_grace(span tstzrange, subscription public.subscriptions)
returns tstzrange
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(span) = subscription.period_end
      then tstzrange(lower(span), upper(span) + public.plan_grace())
    else span
  end;
$$;

-- A user's AI windows now, and what was used in each: the paid fields on the trial and premium,
-- the free ones on the free plan, the others null.
create type public.ai_windows as (
  plan public.plan,
  -- The trial's or premium's budget period and its week, with their budgets and what calls made
  -- in them cost or set aside.
  period tstzrange,
  week tstzrange,
  budget_usd numeric,
  weekly_budget_usd numeric,
  period_used_usd numeric,
  week_used_usd numeric,
  -- The free week, its number and backstop, and what its free calls gave and did cost; a call
  -- of the counted feature in flight counts toward the number.
  free_week tstzrange,
  weekly_count integer,
  count_used integer,
  free_budget_usd numeric,
  free_used_usd numeric
);

-- The windows of `user_id` now, as ADR 0078 counts them.
create function public.ai_windows(user_id uuid)
returns public.ai_windows
language plpgsql
stable
set search_path = ''
as $$
declare
  subscription public.subscriptions;
  limits public.plans;
  at timestamptz;
  result public.ai_windows;
begin
  result.plan := public.plan_of(ai_windows.user_id);
  select * into limits from public.plans p where p.plan = result.plan;
  result.budget_usd := limits.budget_usd;
  result.weekly_budget_usd := limits.weekly_budget_usd;
  result.weekly_count := limits.weekly_photos;
  result.free_budget_usd := limits.weekly_free_usd;

  if result.plan = 'free' then
    result.free_week := public.week_of(
      tstzrange((select u.created_at from auth.users u where u.id = ai_windows.user_id), null),
      now()
    );
    select
      coalesce(sum(u.cost_usd), 0),
      count(*) filter (where u.feature = public.ai_counted_feature() and u.given)
    into result.free_used_usd, result.count_used
    from public.ai_usage u
    where u.user_id = ai_windows.user_id and u.free and u.created_at <@ result.free_week;
    result.count_used := result.count_used + (
      select count(*) from public.ai_calls_in_flight c
      where c.user_id = ai_windows.user_id and c.free
        and c.feature = public.ai_counted_feature()
    );
    return result;
  end if;

  select * into subscription from public.subscriptions s where s.user_id = ai_windows.user_id;
  -- The plan lasts an hour past its period (plan_of()): in that hour the period's last window
  -- is the one in force, and what is used in the hour counts toward it.
  at := least(now(), subscription.period_end - interval '1 microsecond');
  result.period := public.budget_period(
    subscription.period_start, subscription.period_end, subscription.billing, at
  );
  result.week := public.week_of(result.period, at);
  select
    coalesce(sum(u.cost_usd), 0),
    coalesce(sum(u.cost_usd) filter (where u.created_at <@ public.with_grace(result.week, subscription)), 0)
  into result.period_used_usd, result.week_used_usd
  from public.ai_usage u
  where u.user_id = ai_windows.user_id and not u.free
    and u.created_at <@ public.with_grace(result.period, subscription);
  -- What calls running now set aside counts in both.
  select
    result.period_used_usd + coalesce(sum(c.reserved_usd), 0),
    result.week_used_usd + coalesce(sum(c.reserved_usd), 0)
  into result.period_used_usd, result.week_used_usd
  from public.ai_calls_in_flight c
  where c.user_id = ai_windows.user_id and not c.free;
  return result;
end;
$$;

-- Whether the calling user may call a model for `feature` now, which the app shows. On the free
-- plan, only the counted feature, while the week's number and backstop last; on the trial and
-- premium, while both the period's and the week's budget last, the one with less left being the
-- budget it gives. When it refuses, resets_at is when that opens again. In place of
-- 20261102210000_plans_and_subscriptions.sql's, which counted a calendar month.
drop function public.ai_access();
create function public.ai_access(feature public.ai_feature default 'coach_chat')
returns public.ai_access
language plpgsql
stable
-- Reads the plans, the calls and whether the user is a guest, which callers may not.
security definer
set search_path = ''
as $$
declare
  windows public.ai_windows;
  result public.ai_access;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  result.by_count := false;
  if (select u.is_anonymous from auth.users u where u.id = (select auth.uid())) then
    result.reason := 'account_required';
    result.allowed := false;
    result.budget_usd := 0;
    result.used_usd := 0;
    return result;
  end if;

  windows := public.ai_windows((select auth.uid()));
  if windows.plan = 'free' then
    if feature = public.ai_counted_feature() then
      result.by_count := true;
      result.left_count := greatest(windows.weekly_count - windows.count_used, 0);
      result.budget_usd := windows.free_budget_usd;
      result.used_usd := windows.free_used_usd;
      result.resets_at := upper(windows.free_week);
      if result.left_count = 0 or windows.free_used_usd >= windows.free_budget_usd then
        result.reason := 'limit_reached';
      end if;
    else
      result.reason := 'plan_required';
      result.budget_usd := 0;
      result.used_usd := 0;
    end if;
  else
    -- The window with less left decides, as calls are held to both.
    if windows.weekly_budget_usd is not null
      and windows.weekly_budget_usd - windows.week_used_usd
        < windows.budget_usd - windows.period_used_usd then
      result.budget_usd := windows.weekly_budget_usd;
      result.used_usd := windows.week_used_usd;
      result.resets_at := upper(windows.week);
    else
      result.budget_usd := windows.budget_usd;
      result.used_usd := windows.period_used_usd;
      result.resets_at := upper(windows.period);
    end if;
    if windows.period_used_usd >= windows.budget_usd then
      -- The period's end is the later, should the week be spent too.
      result.reason := 'limit_reached';
      result.resets_at := upper(windows.period);
    elsif windows.week_used_usd >= windows.weekly_budget_usd then
      result.reason := 'limit_reached';
    end if;
    -- In a plan's grace its windows have ended, and nothing opens again until it is renewed.
    if result.resets_at <= now() then
      result.resets_at := null;
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

-- As before (20261030200000_count_ai_call.sql), with no limit by cost for a feature limited
-- `by_count`: its call is held by its count, and its backstop by what calls did cost, never by
-- what one sets aside.
drop function public.ai_call_refusal(
  public.ai_feature_limits, public.ai_model_prices, integer, numeric, numeric
);
create function public.ai_call_refusal(
  limits public.ai_feature_limits,
  price public.ai_model_prices,
  input_tokens integer,
  other_used_usd numeric,
  budget_usd numeric,
  by_count boolean
)
returns public.ai_access_reason
language sql
stable
set search_path = ''
as $$
  select case
    when input_tokens > limits.max_input_tokens then 'request_too_large'
    when price is null then 'unpriced_model'
    when not by_count
      and other_used_usd + public.ai_cost(price, input_tokens, 0, limits.max_output_tokens)
        > budget_usd then 'limit_reached'
  end::public.ai_access_reason;
$$;

-- As before, deciding by ai_access(feature), and marking a call made on the free plan.
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

  access := public.ai_access(start_ai_call.feature);
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
        limits, price, input_tokens, access.used_usd, access.budget_usd, access.by_count
      );
    end if;
    if result.reason is null then
      insert into public.ai_calls_in_flight (user_id, feature, model, reserved_usd, counted, free)
      values (
        (select auth.uid()), start_ai_call.feature, start_ai_call.model,
        public.ai_cost(price, input_tokens, 0, limits.max_output_tokens), input_tokens > 0,
        public.plan_of((select auth.uid())) = 'free'
      )
      returning call_id into result.call_id;
      result.max_output_tokens := limits.max_output_tokens;
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

-- As before, deciding by ai_access() for the call's feature.
create or replace function public.count_ai_call(call_id uuid, input_tokens integer)
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
  access := public.ai_access(started.feature);
  result.reason := public.ai_call_refusal(
    limits, public.ai_model_price(started.model, started.started_at), input_tokens,
    access.used_usd - started.reserved_usd, access.budget_usd, access.by_count
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

-- As before (20261030100000_ai_usage.sql), keeping whether the call was made on the free plan,
-- and whether it gave what it was for, which the Edge Function says when it knows: a whole
-- answer, for the free plan's number.
drop function public.record_ai_usage(uuid, integer, integer, integer, integer, boolean);
create function public.record_ai_usage(
  call_id uuid,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  thinking_tokens integer,
  known boolean default true,
  given boolean default null
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
    select u.call_id, u.user_id, u.feature, u.model, u.created_at, u.cost_usd, u.free
    into started.call_id, started.user_id, started.feature, started.model, started.started_at,
      started.reserved_usd, started.free
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
    thinking_tokens, cost_usd, estimated, created_at, free, given
  )
  values (
    started.call_id, started.user_id, started.feature, started.model, input_tokens,
    cached_input_tokens, output_tokens, thinking_tokens, cost, not known, started.started_at,
    started.free, record_ai_usage.given
  )
  on conflict on constraint ai_usage_call_id_key do update set
    input_tokens = excluded.input_tokens,
    cached_input_tokens = excluded.cached_input_tokens,
    output_tokens = excluded.output_tokens,
    thinking_tokens = excluded.thinking_tokens,
    cost_usd = excluded.cost_usd,
    estimated = excluded.estimated,
    given = excluded.given;
  return cost;
end;
$$;

revoke all on function public.ai_counted_feature() from public, anon, authenticated;
revoke all on function public.plan_grace() from public, anon, authenticated;
revoke all on function public.ai_call_refusal(
  public.ai_feature_limits, public.ai_model_prices, integer, numeric, numeric, boolean
) from public, anon, authenticated;
revoke all on function public.budget_period(timestamptz, timestamptz, public.billing_period, timestamptz)
  from public, anon, authenticated;
revoke all on function public.week_of(tstzrange, timestamptz) from public, anon, authenticated;
revoke all on function public.with_grace(tstzrange, public.subscriptions)
  from public, anon, authenticated;
revoke all on function public.ai_windows(uuid) from public, anon, authenticated;
revoke all on function public.ai_access(public.ai_feature) from public, anon;
grant execute on function public.ai_access(public.ai_feature) to authenticated;
revoke all on function public.record_ai_usage(uuid, integer, integer, integer, integer, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid, integer, integer, integer, integer, boolean, boolean)
  to service_role;
