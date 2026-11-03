-- A plan switcher for the developer tools (ADR 0080): dev_set_plan() puts the caller on the free
-- plan, the trial or premium, only where the Vault holds `dev_tools` set to `on`, which only a
-- local stack does, and my_plan() says which plan the caller is on. A plan given by hand, by
-- give_plan() or the switcher, is written by one internal function, so that its trigger applies
-- the plan's limits as for any other change.
-- New error code:
--   BB053  the developer tools are off on this database

-- Gives `user_id` a `plan` from `starts` to `ends` by hand, in place of the one they had. Only
-- give_plan() and dev_set_plan() call it.
create function public.give_plan_by_hand(
  user_id uuid,
  plan public.plan,
  starts timestamptz,
  ends timestamptz,
  billing public.billing_period
)
returns void
language sql
set search_path = ''
as $$
  insert into public.subscriptions as s
    (user_id, plan, period_start, period_end, billing, source)
  values (give_plan_by_hand.user_id, give_plan_by_hand.plan, starts, ends, give_plan_by_hand.billing, 'manual')
  on conflict (user_id) do update set
    plan = excluded.plan,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    billing = excluded.billing,
    source = excluded.source;
$$;

-- As before (20261102210000_plans_and_subscriptions.sql), writing through give_plan_by_hand().
create or replace function public.give_plan(
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
  perform public.give_plan_by_hand(given_id, give_plan.plan, starts, ends, give_plan.billing);
  return given_id;
end;
$$;

-- The plan the calling user is on now.
create function public.my_plan()
returns public.plan
language sql
stable
-- Reads the caller's own subscription only, as its policy would.
security definer
set search_path = ''
as $$
  select public.plan_of((select auth.uid()));
$$;

-- Puts the caller on `plan` from now: the free plan without a subscription, the trial for its
-- seven days, or a month of premium. Gives the plan they are on then.
create function public.dev_set_plan(plan public.plan)
returns public.plan
language plpgsql
-- Reads Vault and writes the caller's subscription, which users may only read.
security definer
set search_path = ''
as $$
begin
  if (
    select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'dev_tools'
  ) is distinct from 'on' then
    raise exception 'The developer tools are off on this database' using errcode = 'BB053';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- A plan needs an account, as give_plan() and the trial do (ADR 0078).
  if (select u.is_anonymous from auth.users u where u.id = (select auth.uid())) then
    raise exception 'A guest has no plan' using errcode = '42501';
  end if;

  if dev_set_plan.plan = 'free' then
    delete from public.subscriptions s where s.user_id = (select auth.uid());
  else
    perform public.give_plan_by_hand(
      (select auth.uid()),
      dev_set_plan.plan,
      now(),
      -- The trial's seven days, as the stores run it (ADR 0078), or a month of premium.
      now() + case when dev_set_plan.plan = 'trial' then interval '7 days' else interval '1 month' end,
      'monthly'
    );
  end if;
  return public.plan_of((select auth.uid()));
end;
$$;

revoke all on function public.give_plan_by_hand(uuid, public.plan, timestamptz, timestamptz, public.billing_period)
  from public, anon, authenticated, service_role;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
revoke all on function public.dev_set_plan(public.plan) from public, anon;
grant execute on function public.dev_set_plan(public.plan) to authenticated;
