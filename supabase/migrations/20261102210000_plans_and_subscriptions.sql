-- Plans, their numbers, and who is on which (#408, ADR 0078): a row per plan in `plans`, each
-- user's subscription in `subscriptions`, and plan_of() and has_premium() to read them. A plan is
-- given by hand until the store's purchases are built. AI budgets follow from the plan, in place
-- of `ai_budgets`; the windows they are counted in come with #409.

create type public.plan as enum ('free', 'trial', 'premium');
create type public.billing_period as enum ('monthly', 'yearly');
create type public.subscription_source as enum ('manual', 'revenuecat');

-- What each plan gives. Null is no limit of that kind. Only `budget_usd` is read so far, by
-- ai_access(): the weekly numbers take effect with #409, and the workout limits with #410, until
-- which workout_limits() decides them as before.
create table public.plans (
  plan public.plan primary key,
  -- Workouts a user may have, archived ones included, and exercises in each (ADR 0018).
  workouts integer not null check (workouts > 0),
  exercises integer not null check (exercises > 0),
  -- Versions a workout may have, its own exercises included, and the alternatives a user may add
  -- across all their workouts (ADR 0061).
  versions integer not null check (versions > 0),
  added_alternatives integer check (added_alternatives >= 0),
  -- What AI may cost in a budget period, and in a week of it.
  budget_usd numeric(8, 2) not null check (budget_usd >= 0),
  weekly_budget_usd numeric(8, 2) check (weekly_budget_usd >= 0),
  -- Meals a free user may have estimated from a photo a week, and what its free calls may cost.
  weekly_photos integer check (weekly_photos >= 0),
  weekly_free_usd numeric(8, 2) check (weekly_free_usd >= 0)
);

insert into public.plans
  (plan, workouts, exercises, versions, added_alternatives, budget_usd, weekly_budget_usd,
   weekly_photos, weekly_free_usd)
values
  ('free', 3, 20, 2, 1, 0, null, 2, 0.10),
  ('trial', 500, 20, 5, null, 1.50, 1.50, null, null),
  ('premium', 500, 20, 5, null, 4, 1.50, null, null);

-- A user's subscription, as the store or a hand gave it: the plan it gives, its billing period,
-- whether it is billed monthly or yearly, as a yearly period's budget is counted by the month,
-- and where it came from. One per user, the latest.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan not null check (plan <> 'free'),
  period_start timestamptz not null,
  period_end timestamptz not null,
  billing public.billing_period not null,
  source public.subscription_source not null,
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

create policy "Users read their own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.plans, public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function extensions.moddatetime(updated_at);

-- The plan `user_id` is on now: their subscription's while its period, and an hour past it, have
-- not ended, free otherwise. The hour is a grace: a renewal reaches us a little after the store
-- makes it, and in between the plan should not end.
create function public.plan_of(user_id uuid)
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
        and now() < s.period_end + interval '1 hour'
    ),
    'free'
  );
$$;

-- Whether the calling user is on a paid plan or its trial.
create function public.has_premium()
returns boolean
language sql
stable
-- Reads the caller's own subscription only, as its policy would.
security definer
set search_path = ''
as $$
  select public.plan_of((select auth.uid())) <> 'free';
$$;

-- Gives the user of `email` a `plan` by hand, from `starts` to `ends`. It stands in for the
-- store's purchases until they are built, as in development. Gives the user's id.
create function public.give_plan(
  email text,
  starts timestamptz,
  ends timestamptz,
  plan public.plan default 'premium',
  billing public.billing_period default 'monthly'
)
returns uuid
language plpgsql
-- Finds the account by its email, which only the auth schema's owner may read.
security definer
set search_path = ''
as $$
declare
  given_id uuid := (
    select u.id from auth.users u
    where lower(u.email) = lower(give_plan.email) and not u.is_anonymous
  );
begin
  if given_id is null then
    raise exception 'No account has that email' using errcode = 'P0002';
  end if;
  insert into public.subscriptions as s
    (user_id, plan, period_start, period_end, billing, source)
  values (given_id, give_plan.plan, starts, ends, give_plan.billing, 'manual')
  on conflict (user_id) do update set
    plan = excluded.plan,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    billing = excluded.billing,
    source = excluded.source;
  return given_id;
end;
$$;

-- As before (20261030100000_ai_usage.sql), with the budget of the caller's plan in place of
-- `ai_budgets`: the trial's and premium's, nothing on the free plan. Counted by calendar month
-- until #409 counts it by the plan's own windows.
create or replace function public.ai_access()
returns public.ai_access
language plpgsql
stable
-- Reads the plans, the calls and whether the user is a guest, which callers may not.
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

  result.budget_usd := (
    select p.budget_usd from public.plans p where p.plan = public.plan_of((select auth.uid()))
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

drop table public.ai_budgets;

revoke all on function public.plan_of(uuid) from public, anon, authenticated;
revoke all on function public.has_premium() from public, anon;
grant execute on function public.has_premium() to authenticated;
revoke all on function public.give_plan(text, timestamptz, timestamptz, public.plan, public.billing_period)
  from public, anon, authenticated;
grant execute on function public.give_plan(text, timestamptz, timestamptz, public.plan, public.billing_period)
  to service_role;
