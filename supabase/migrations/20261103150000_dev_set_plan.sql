-- A plan switcher for the developer tools (ADR 0080): dev_set_plan() puts the caller on the free
-- plan, the trial or premium, only where the Vault holds `dev_tools` set to `on`, which only a
-- local stack does. It writes `subscriptions` as a plan given by hand, so that its trigger applies
-- the plan's limits as for any other change.
-- New error code:
--   BB053  the developer tools are off on this database

create function public.dev_set_plan(plan public.plan)
returns void
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
    return;
  end if;
  -- The trial's seven days, or a month of premium, from now.
  insert into public.subscriptions as s
    (user_id, plan, period_start, period_end, billing, source)
  values (
    (select auth.uid()),
    dev_set_plan.plan,
    now(),
    now() + case when dev_set_plan.plan = 'trial' then interval '7 days' else interval '1 month' end,
    'monthly',
    'manual'
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    billing = excluded.billing,
    source = excluded.source;
end;
$$;

revoke all on function public.dev_set_plan(public.plan) from public, anon;
grant execute on function public.dev_set_plan(public.plan) to authenticated;
