-- Explicit consent to send health data to the AI provider (#290, ADR 0142), which Bite and meals
-- from photos ask for when first used, apart from the consent of the onboarding, as they send it
-- for another purpose to another recipient. Like that consent, an entry is never changed, so the
-- history shows which version was given when; it is deleted with the user.
create table public.ai_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  consent_version text not null check (length(consent_version) between 1 and 32),
  granted_at timestamptz not null default now()
);

create index ai_consents_user_id_idx on public.ai_consents (user_id);

-- Users read and give their own; nobody changes one.
alter table public.ai_consents enable row level security;

create policy "Users read their own AI consents"
  on public.ai_consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users give their own AI consent"
  on public.ai_consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.ai_consents from anon, authenticated;
grant select on public.ai_consents to authenticated;
grant insert (user_id, consent_version) on public.ai_consents to authenticated;

-- Whether the user has consented to the AI features, which ai_access() asks.
create function public.has_ai_consent(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.ai_consents c where c.user_id = has_ai_consent.user_id);
$$;

revoke execute on function public.has_ai_consent(uuid) from public, anon, authenticated;

-- As before, and refused as consent_required until the user has consented to the AI features, so
-- that neither Bite nor meals from photos send anything without it.
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
  -- Consent is asked only of a user the plan lets in, so that a free user who taps Bite is told
  -- about premium first.
  if result.reason is null and not public.has_ai_consent((select auth.uid())) then
    result.reason := 'consent_required';
  end if;
  -- The provider's limit for all users together comes last, so that the user's own reasons say
  -- more: a guest still needs an account, a used-up month stays used up, and consent comes first.
  if result.reason is null and public.ai_spend_paused() then
    result.reason := 'service_paused';
  end if;
  result.allowed := result.reason is null;
  return result;
end;
$$;
