-- Asking for the consents again when their text changes (#690, ADR 0159). The server names each
-- text's current version (ADR 0156); a consent covers only the text it was given to.

-- Records that the caller consents to the current text about their health data, in the history
-- the onboarding started. Only a user whose consent holds renews it: after a withdrawal the
-- onboarding asks from the start. Only the current version can be given (BB066 otherwise).
create function public.give_health_consent(policy_version text)
returns void
language plpgsql
-- Writes health_data_consents, which clients only read.
security definer
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  caller_id uuid := (select auth.uid());
  current_version text;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Not while the user's consent is being withdrawn, as on another phone: a renewal that slipped
  -- in would hold again over what the withdrawal deleted.
  perform public.lock_health_consent(caller_id);
  if not public.has_health_consent(caller_id) then
    raise exception 'There is no health data consent to renew' using errcode = 'BB062';
  end if;

  select c.version into current_version from public.current_agreement('health_consent') c;
  if policy_version is distinct from current_version then
    raise exception 'This is not the current text of the consent' using errcode = 'BB066';
  end if;

  -- Giving it twice, as with a second tap or on a second phone, adds nothing.
  if policy_version is distinct from (
    select c.policy_version
    from public.health_data_consents c
    where c.user_id = caller_id
    order by c.granted_at desc, c.id desc
    limit 1
  ) then
    insert into public.health_data_consents (user_id, policy_version)
    values (caller_id, give_health_consent.policy_version);
  end if;
end;
$$;

-- Whether the user's latest consent to the AI features was given to the current text. Without a
-- current version on the server it counts as current: the rule must not close Bite by mistake.
create function public.ai_consent_is_current(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select c.consent_version
      from public.ai_consents c
      where c.user_id = ai_consent_is_current.user_id
      order by c.granted_at desc, c.id desc
      limit 1
    ) = (select a.version from public.current_agreement('ai_consent') a),
    true
  );
$$;

-- A consent to the AI features is given to the current text only (BB066): an app that last heard
-- of an older version would record a consent that opens nothing, and ask again at once. Unlike
-- the terms and the health data consent, any version is taken while the server names none, as
-- ai_consent_is_current() counts it: the rule must not close Bite by mistake.
create function public.refuse_stale_ai_consent()
returns trigger
language plpgsql
-- Reads the texts' versions, which are closed to clients.
security definer
set search_path = ''
as $$
begin
  if new.consent_version is distinct from coalesce(
    (select a.version from public.current_agreement('ai_consent') a), new.consent_version
  ) then
    raise exception 'This is not the current text of the consent' using errcode = 'BB066';
  end if;
  return new;
end;
$$;

create trigger ai_consents_name_the_current_text
  before insert on public.ai_consents
  for each row execute function public.refuse_stale_ai_consent();

-- ai_access() as before (ADR 0142), and consent_required too when the consent was given to an
-- older text: Bite and meals from photos then ask for it again at their next use, with the screen
-- that asks the first time. What rests on the consent stays, and the user can still withdraw it.
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
  -- about premium first. A consent to an older text is asked for again (ADR 0159).
  if result.reason is null and not (
    public.has_ai_consent((select auth.uid()))
    and public.ai_consent_is_current((select auth.uid()))
  ) then
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

-- New functions are closed to clients (ADR 0126); a guest has a session too.
revoke all on function public.give_health_consent(text) from public, anon, authenticated;
grant execute on function public.give_health_consent(text) to authenticated;
revoke all on function public.ai_consent_is_current(uuid) from public, anon, authenticated;
revoke all on function public.refuse_stale_ai_consent() from public, anon, authenticated;
