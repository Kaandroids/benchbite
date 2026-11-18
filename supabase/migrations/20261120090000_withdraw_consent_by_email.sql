-- Withdrawing a consent from the website, with a link sent to the account's email address (#653,
-- ADR 0146), as an account is deleted there (ADR 0094). Only the Edge Functions reach these tables
-- and functions, through the service role; no client can.

-- The withdrawals of the app (ADR 0143, ADR 0144) for a named user, so that a link withdraws
-- exactly what the app does. They raise BB060 and BB062 as before when there is nothing to
-- withdraw. Called only from the functions below, which run as their owner.
create function public.withdraw_ai_consent_of(user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.lock_ai_consent(withdraw_ai_consent_of.user_id);
  if not public.has_ai_consent(withdraw_ai_consent_of.user_id) then
    raise exception 'There is no AI consent to withdraw' using errcode = 'BB060';
  end if;
  perform public.end_ai_consent(withdraw_ai_consent_of.user_id);
end;
$$;

-- What withdraw_health_consent() deleted and recorded, in the same order, for the same reasons.
create function public.withdraw_health_consent_of(user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  owner_id uuid := withdraw_health_consent_of.user_id;
begin
  -- In the order other writes take them, the limits first (save_workout()), so that the two never
  -- wait for each other. After a write being made now, which this then deletes, or before it,
  -- which is then refused.
  perform public.lock_user_limits(owner_id);
  perform public.lock_health_consent(owner_id);
  if not public.has_health_consent(owner_id) then
    raise exception 'There is no health data consent to withdraw' using errcode = 'BB062';
  end if;

  perform public.end_ai_consent(owner_id);

  delete from public.meal_entries m where m.user_id = owner_id;
  -- After the meals, whose delete records them here.
  delete from public.removed_meal_entries r where r.user_id = owner_id;
  delete from public.water_days w where w.user_id = owner_id;
  delete from public.step_days s where s.user_id = owner_id;

  delete from public.workout_logs l where l.user_id = owner_id;
  delete from public.outside_workouts o where o.user_id = owner_id;
  delete from public.workout_moves m where m.user_id = owner_id;
  delete from public.workouts w where w.user_id = owner_id;
  delete from public.planned_days_kept k where k.user_id = owner_id;
  delete from public.planned_days d where d.user_id = owner_id;
  delete from public.applied_plans a where a.user_id = owner_id;

  delete from public.day_nutrition_targets d where d.user_id = owner_id;
  delete from public.own_nutrition_targets o where o.user_id = owner_id;
  delete from public.streak_days s where s.user_id = owner_id;
  delete from public.user_streaks s where s.user_id = owner_id;
  delete from public.weight_entries w where w.user_id = owner_id;
  delete from public.goals g where g.user_id = owner_id;
  delete from public.profiles p where p.user_id = owner_id;

  -- Last, as deleting workouts writes their planned days, which the withdrawal would refuse.
  insert into public.health_data_consent_withdrawals (user_id) values (owner_id);
end;
$$;

revoke execute on function public.withdraw_ai_consent_of(uuid),
  public.withdraw_health_consent_of(uuid) from public, anon, authenticated;

-- As before, through the functions above.
create or replace function public.withdraw_ai_consent()
returns void
language plpgsql
-- Writes the withdrawals and stops, which callers may not.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.withdraw_ai_consent_of(caller_id);
end;
$$;

create or replace function public.withdraw_health_consent()
returns void
language plpgsql
-- Deletes rows the user may not delete themselves, and writes the withdrawals.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.withdraw_health_consent_of(caller_id);
end;
$$;

-- A link sent to an account's address to withdraw one consent: only the hash of its token is
-- kept, with the address it went to, so it works only while that is still the account's (#563).
create table public.consent_withdrawal_links (
  token_hash bytea primary key,
  user_id uuid not null references auth.users on delete cascade,
  email text not null,
  consent text not null check (consent in ('health', 'ai')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index on public.consent_withdrawal_links (user_id);

-- Every request for a link, to limit them per address and per IP, as hashes and for a day.
create table public.consent_withdrawal_requests (
  email_hash bytea not null,
  ip_hash bytea not null,
  created_at timestamptz not null default now()
);
create index on public.consent_withdrawal_requests (email_hash, created_at);
create index on public.consent_withdrawal_requests (ip_hash, created_at);

alter table public.consent_withdrawal_links enable row level security;
alter table public.consent_withdrawal_requests enable row level security;
revoke all on public.consent_withdrawal_links, public.consent_withdrawal_requests
  from anon, authenticated;

-- Records a request and, unless it came too often, makes a link to withdraw `p_consent` for the
-- account with this confirmed address, with the limits of start_account_deletion(): 3 an hour for
-- an address from each IP and 10 from all, 10 an hour for an IP. Returns the address stored for
-- the account, the one to send the link to, or null when no link was made. A link is made whether
-- or not the consent is given now, so that the email says nothing the website does not.
create function public.start_consent_withdrawal(
  p_email text,
  p_ip_hash bytea,
  p_token_hash bytea,
  p_consent text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_email_hash bytea := extensions.digest(v_email, 'sha256');
  v_user uuid;
  v_stored text;
begin
  perform pg_advisory_xact_lock(3, hashtext(encode(v_email_hash, 'hex')));
  perform pg_advisory_xact_lock(4, hashtext(encode(p_ip_hash, 'hex')));

  if (
    select count(*) from public.consent_withdrawal_requests
    where email_hash = v_email_hash and ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 3 or (
    select count(*) from public.consent_withdrawal_requests
    where email_hash = v_email_hash and created_at > now() - interval '1 hour'
  ) >= 10 or (
    select count(*) from public.consent_withdrawal_requests
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= 10 then
    return null;
  end if;

  insert into public.consent_withdrawal_requests (email_hash, ip_hash)
  values (v_email_hash, p_ip_hash);

  -- Auth keeps addresses in lower case, so the unique index finds it.
  select id, email into v_user, v_stored from auth.users
  where email = v_email and not is_sso_user and not is_anonymous and email_confirmed_at is not null;
  if v_user is null then
    return null;
  end if;

  insert into public.consent_withdrawal_links (token_hash, user_id, email, consent, expires_at)
  values (p_token_hash, v_user, v_stored, p_consent, now() + interval '30 minutes');
  return v_stored;
end;
$$;

-- Withdraws the consent of a link that still works, its address still the account's and its
-- consent the one the page named, and uses up the link, in one transaction: if the withdrawal
-- fails, the link still works for another try. Answers false for a link that does not work. A
-- consent already withdrawn counts as withdrawn, as in the app.
create function public.withdraw_consent_by_link(p_token_hash bytea, p_consent text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  delete from public.consent_withdrawal_links link
  using auth.users
  where link.token_hash = p_token_hash and link.consent = p_consent and link.expires_at > now()
    and users.id = link.user_id and users.email = link.email
  returning link.user_id into v_user;
  if v_user is null then
    return false;
  end if;

  begin
    if p_consent = 'health' then
      perform public.withdraw_health_consent_of(v_user);
    else
      perform public.withdraw_ai_consent_of(v_user);
    end if;
  exception when sqlstate 'BB060' or sqlstate 'BB062' then
    null;
  end;
  return true;
end;
$$;

-- What a day has made old: links that no longer work, and requests the limits no longer count.
create function public.remove_old_consent_withdrawals()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.consent_withdrawal_links where expires_at < now() - interval '1 day';
  delete from public.consent_withdrawal_requests where created_at < now() - interval '1 day';
$$;

-- Only request-consent-withdrawal and confirm-consent-withdrawal call them, with the service role
-- (ADR 0126); the clean-up only pg_cron.
revoke execute on function public.start_consent_withdrawal(text, bytea, bytea, text),
  public.withdraw_consent_by_link(bytea, text), public.remove_old_consent_withdrawals()
  from public, anon, authenticated;
grant execute on function public.start_consent_withdrawal(text, bytea, bytea, text),
  public.withdraw_consent_by_link(bytea, text) to service_role;

select cron.schedule(
  'remove-old-consent-withdrawals', '40 * * * *', 'select public.remove_old_consent_withdrawals()'
);
