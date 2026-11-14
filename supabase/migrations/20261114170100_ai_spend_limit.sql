-- The AI spend of all users together, against the provider's monthly limit (#555, ADR 0134). Each
-- user's own budget stays as it is (ADR 0051); the provider stops every call once the project's
-- limit is reached, so Bite stops first, with a reason the app words, and the Monitor warns before.

-- The provider's monthly limit as Benchbite counts toward it, and the share of it the Monitor warns
-- at. One row. The provider's limit is in euros and resets on the first of the month; it is kept
-- here as as many dollars, the currency costs are counted in, which stops a little early as long
-- as a euro is worth more than a dollar.
create table public.ai_spend_limit (
  id boolean primary key default true check (id),
  monthly_cap_usd numeric(10, 2) not null check (monthly_cap_usd > 0),
  alert_share numeric(3, 2) not null check (alert_share > 0 and alert_share < 1)
);

alter table public.ai_spend_limit enable row level security;
revoke all on public.ai_spend_limit from anon, authenticated;

insert into public.ai_spend_limit (monthly_cap_usd, alert_share) values (50, 0.8);

-- What all users' calls cost each calendar month (UTC), kept apart from ai_usage, whose rows go with
-- a deleted account while the provider still bills them, and so that the month needs no sum.
create table public.ai_spend_months (
  month date primary key check (month = date_trunc('month', month)),
  cost_usd numeric(14, 6) not null default 0 check (cost_usd >= 0)
);

alter table public.ai_spend_months enable row level security;
revoke all on public.ai_spend_months from anon, authenticated;

-- Adds what a call costs to its month, and what recording it again changed, as when a call counted
-- at its most records what it used.
create function public.count_ai_spend()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.ai_spend_months (month, cost_usd)
  values (
    date_trunc('month', new.created_at at time zone 'UTC')::date,
    new.cost_usd - case when tg_op = 'UPDATE' then old.cost_usd else 0 end
  )
  on conflict (month) do update
    set cost_usd = greatest(public.ai_spend_months.cost_usd + excluded.cost_usd, 0);
  return null;
end;
$$;

revoke execute on function public.count_ai_spend() from public, anon, authenticated, service_role;

create trigger ai_usage_count_spend
  after insert or update of cost_usd on public.ai_usage
  for each row execute function public.count_ai_spend();

insert into public.ai_spend_months (month, cost_usd)
select date_trunc('month', u.created_at at time zone 'UTC')::date, sum(u.cost_usd)
from public.ai_usage u
group by 1;

-- What this month's calls of all users cost so far, those running counted at their most. Only those
-- started this month: a call left behind is recorded in the month it started, by its user's next
-- call, which may never come.
create function public.ai_month_spend_usd()
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    coalesce((
      select m.cost_usd from public.ai_spend_months m
      where m.month = date_trunc('month', now() at time zone 'UTC')::date
    ), 0)
    + coalesce((
      select sum(c.reserved_usd) from public.ai_calls_in_flight c
      where c.started_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    ), 0);
$$;

-- Whether this month's spend has reached the limit, so that no call starts until the next month.
create function public.ai_spend_paused()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.ai_month_spend_usd() >= l.monthly_cap_usd from public.ai_spend_limit l;
$$;

-- As before, and refused as service_paused once the month's spend of all users has reached the
-- limit. start_ai_call() asks it, so that no call starts then.
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
  if public.is_guest() then
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
      result.left_count := public.free_count_left(windows);
      result.budget_usd := windows.free_budget_usd;
      result.used_usd := windows.free_used_usd;
      result.resets_at := upper(windows.free_week);
      if result.left_count = 0 then
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
  -- The provider's limit for all users together comes last, so that the user's own reasons say
  -- more: a guest still needs an account, and a used-up month stays used up.
  if result.reason is null and public.ai_spend_paused() then
    result.reason := 'service_paused';
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;

-- How far this month's spend is toward the limit, for the Monitor workflow (ADR 0067), whose log
-- is public: only whole percentages, no amounts. Healthy below the share it warns at.
create function public.ai_spend_status()
returns table (used_percent integer, alert_percent integer, paused boolean, healthy boolean)
language sql
stable
set search_path = ''
as $$
  select
    floor(100 * public.ai_month_spend_usd() / l.monthly_cap_usd)::integer,
    round(100 * l.alert_share)::integer,
    public.ai_spend_paused(),
    public.ai_month_spend_usd() < l.alert_share * l.monthly_cap_usd
  from public.ai_spend_limit l;
$$;

revoke execute on function public.ai_month_spend_usd()
  from public, anon, authenticated, service_role;
revoke execute on function public.ai_spend_paused()
  from public, anon, authenticated, service_role;
revoke execute on function public.ai_spend_status()
  from public, anon, authenticated, service_role;
-- Only the Monitor's read-only role runs the status, with what it calls (ADR 0132).
grant execute on function public.ai_spend_status() to supabase_read_only_user;
grant execute on function public.ai_month_spend_usd() to supabase_read_only_user;
grant execute on function public.ai_spend_paused() to supabase_read_only_user;
