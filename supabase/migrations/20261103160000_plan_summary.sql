-- What the premium page shows of the caller's plan (#411, ADR 0078): the plan, how it is billed
-- and when it renews, and how much of each AI window is left. The windows are given as a share
-- left and when they open again, never in money, which the app does not show; the free plan's
-- meal photos are a number, which it does.

create type public.plan_summary as (
  plan public.plan,
  -- The trial's or premium's billing and the end of its period; null on the free plan.
  billing public.billing_period,
  period_end timestamptz,
  -- On the trial and premium: the share of the week's and the period's budget left, from 0 to 1,
  -- and when each starts again. The week's is null on a plan without a weekly budget.
  week_left numeric,
  week_resets_at timestamptz,
  period_left numeric,
  period_resets_at timestamptz,
  -- On the free plan: the meal photos of the week, how many are left, and when the next week
  -- starts.
  photos_per_week integer,
  photos_left integer,
  photos_reset_at timestamptz
);

-- The share of `budget` that `used` leaves, from 0 to 1; null without a budget.
create function public.share_left(used numeric, budget numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when budget is null or budget <= 0 then null
    else least(greatest(1 - used / budget, 0), 1)
  end;
$$;

create function public.plan_summary()
returns public.plan_summary
language plpgsql
stable
-- Reads the AI windows, the plans and the calls, which callers may not.
security definer
set search_path = ''
as $$
declare
  windows public.ai_windows;
  subscription public.subscriptions;
  result public.plan_summary;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  windows := public.ai_windows((select auth.uid()));
  result.plan := windows.plan;
  if windows.plan = 'free' then
    result.photos_per_week := windows.weekly_count;
    result.photos_left := greatest(windows.weekly_count - windows.count_used, 0);
    result.photos_reset_at := upper(windows.free_week);
    return result;
  end if;

  select * into subscription from public.subscriptions s where s.user_id = (select auth.uid());
  result.billing := subscription.billing;
  result.period_end := subscription.period_end;
  result.period_left := public.share_left(windows.period_used_usd, windows.budget_usd);
  result.period_resets_at := upper(windows.period);
  result.week_left := public.share_left(windows.week_used_usd, windows.weekly_budget_usd);
  result.week_resets_at := case when windows.weekly_budget_usd is null then null else upper(windows.week) end;
  return result;
end;
$$;

revoke all on function public.share_left(numeric, numeric) from public, anon, authenticated;
revoke all on function public.plan_summary() from public, anon;
grant execute on function public.plan_summary() to authenticated;
