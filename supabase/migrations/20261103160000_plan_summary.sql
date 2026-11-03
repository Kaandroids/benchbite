-- What the premium page shows of the caller's plan (#411, ADR 0078): the plan, how it is billed
-- and when it renews, and how much of each AI window is left; and what each plan allows, for its
-- comparison. The windows are given as a share left and when they open again, never in money,
-- which the app does not show; the free plan's meal photos are a number, which it does.

create type public.plan_summary as (
  plan public.plan,
  -- A guest, who has no AI until they have an account, as ai_access() says too.
  account_required boolean,
  -- Whether the user has had the trial, which is offered once.
  had_trial boolean,
  -- The trial's or premium's billing, and the end of its period; the end is null on the free plan
  -- and in the hour of grace after it has passed.
  billing public.billing_period,
  period_end timestamptz,
  -- On the trial and premium: the share of the week's and the period's budget left, from 0 to 1,
  -- and when each starts again. The week's is null on a plan whose week is its period, such as the
  -- trial; the times are null in the plan's grace.
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

-- The rules both ai_access() and plan_summary() apply to a user's windows, so that the page shows
-- what the gate allows.

-- The free week's meal photos left: none once its backstop is spent, though a photo that gave no
-- estimate did not count.
create function public.free_count_left(windows public.ai_windows)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when windows.free_used_usd >= windows.free_budget_usd then 0
    else greatest(windows.weekly_count - windows.count_used, 0)
  end;
$$;

-- What a paid plan's week has left in money: calls are held to both the week and the period, so
-- no more than the period has left; the period's left on a plan without a weekly budget.
create function public.week_room(windows public.ai_windows)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(
    windows.weekly_budget_usd - windows.week_used_usd,
    windows.budget_usd - windows.period_used_usd
  );
$$;

-- Whether a paid plan is in its grace: its period has passed, and nothing starts again until the
-- store renews it.
create function public.in_grace(windows public.ai_windows)
returns boolean
language sql
stable
set search_path = ''
as $$
  select upper(windows.period) <= now();
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
  result.account_required :=
    (select u.is_anonymous from auth.users u where u.id = (select auth.uid()));
  -- Any subscription row, the trial's or one that followed it, means the trial was had.
  select * into subscription from public.subscriptions s where s.user_id = (select auth.uid());
  result.had_trial := found;
  if windows.plan = 'free' then
    result.photos_per_week := windows.weekly_count;
    result.photos_left :=
      case when result.account_required then 0 else public.free_count_left(windows) end;
    result.photos_reset_at := upper(windows.free_week);
    return result;
  end if;

  result.billing := subscription.billing;
  result.period_left := public.share_left(windows.period_used_usd, windows.budget_usd);
  -- A week only when the plan has one apart from its period: the trial's week is its period.
  if windows.weekly_budget_usd is not null and windows.week <> windows.period then
    result.week_left := public.share_left(
      windows.weekly_budget_usd - public.week_room(windows), windows.weekly_budget_usd
    );
    result.week_resets_at := upper(windows.week);
  end if;
  if public.in_grace(windows) then
    result.week_resets_at := null;
  else
    result.period_end := subscription.period_end;
    result.period_resets_at := upper(windows.period);
  end if;
  return result;
end;
$$;

-- What each plan allows that the premium page compares: workouts, versions of each, alternatives
-- added in all and meal photos a week, null being no limit. Not the budgets, which it never shows.
create function public.plan_numbers()
returns table (
  plan public.plan,
  workouts integer,
  versions integer,
  added_alternatives integer,
  weekly_photos integer
)
language sql
stable
-- Reads `plans`, which callers may not.
security definer
set search_path = ''
as $$
  select p.plan, p.workouts, p.versions, p.added_alternatives, p.weekly_photos
  from public.plans p
  order by p.plan;
$$;

-- As 20261102220000_ai_budget_windows.sql's, with the rules it shares with plan_summary() taken
-- from free_count_left(), week_room() and in_grace().
create or replace function public.ai_access(feature public.ai_feature default 'coach_chat')
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
      if public.free_count_left(windows) = 0 then
        result.reason := 'limit_reached';
      end if;
    else
      result.reason := 'plan_required';
      result.budget_usd := 0;
      result.used_usd := 0;
    end if;
  else
    -- The window with less left decides, as calls are held to both.
    if public.week_room(windows) < windows.budget_usd - windows.period_used_usd then
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
    if public.in_grace(windows) then
      result.resets_at := null;
    end if;
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

revoke all on function public.free_count_left(public.ai_windows) from public, anon, authenticated;
revoke all on function public.week_room(public.ai_windows) from public, anon, authenticated;
revoke all on function public.in_grace(public.ai_windows) from public, anon, authenticated;
revoke all on function public.share_left(numeric, numeric) from public, anon, authenticated;
revoke all on function public.plan_summary() from public, anon;
grant execute on function public.plan_summary() to authenticated;
revoke all on function public.plan_numbers() from public, anon;
grant execute on function public.plan_numbers() to authenticated;
