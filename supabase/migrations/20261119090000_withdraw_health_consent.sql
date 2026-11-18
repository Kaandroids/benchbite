-- Withdrawing the consent to process health data (#652, ADR 0144). Benchbite rests on it, so
-- withdrawing it deletes everything the user logged and planned (GDPR Art. 17(1)(b)) and ends the
-- AI consent with it, as Bite works on the same data; the account, a subscription and the proof of
-- the consents stay, and the user starts the onboarding again.

-- When the user withdrew their consent. Like the consents, an entry is never changed; it is
-- deleted with the user.
create table public.health_data_consent_withdrawals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  withdrawn_at timestamptz not null default now()
);

create index health_data_consent_withdrawals_user_id_idx
  on public.health_data_consent_withdrawals (user_id);

-- Users read their own; only withdraw_health_consent() writes them.
alter table public.health_data_consent_withdrawals enable row level security;

create policy "Users read their own health data consent withdrawals"
  on public.health_data_consent_withdrawals for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.health_data_consent_withdrawals from anon, authenticated;
grant select on public.health_data_consent_withdrawals to authenticated;

-- Whether the user has a health data consent given after their last withdrawal.
create function public.has_health_consent(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.health_data_consents c
    where c.user_id = has_health_consent.user_id
      and c.granted_at > coalesce(
        (select max(w.withdrawn_at) from public.health_data_consent_withdrawals w
          where w.user_id = has_health_consent.user_id),
        '-infinity'
      )
  );
$$;

revoke execute on function public.has_health_consent(uuid) from public, anon, authenticated;

-- Ends the user's AI consent, if they have one, and deletes what rests on it alone (ADR 0143):
-- Bite's chats, whose media go to the purge, its notebook and the stops of answers. Shared by
-- both withdrawals.
create function public.end_ai_consent(user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- After a chat being started now, which this then deletes, or before it, which is then refused.
  perform public.lock_ai_consent(end_ai_consent.user_id);
  if public.has_ai_consent(end_ai_consent.user_id) then
    insert into public.ai_consent_withdrawals (user_id) values (end_ai_consent.user_id);
  end if;
  delete from public.coach_threads t where t.user_id = end_ai_consent.user_id;
  delete from public.coach_notes n where n.user_id = end_ai_consent.user_id;
  delete from public.coach_stops s where s.user_id = end_ai_consent.user_id;
end;
$$;

revoke execute on function public.end_ai_consent(uuid) from public, anon, authenticated;

-- As before, through end_ai_consent().
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
  perform public.lock_ai_consent(caller_id);
  if not public.has_ai_consent(caller_id) then
    raise exception 'There is no AI consent to withdraw' using errcode = 'BB060';
  end if;
  perform public.end_ai_consent(caller_id);
end;
$$;

-- Withdraws the caller's health data consent and deletes, in one transaction, all they logged and
-- planned, in an order the foreign keys allow:
-- - the AI consent and Bite's data, through end_ai_consent();
-- - meals, water and steps;
-- - workout logs with their sets, workouts, the plan and its days;
-- - profile, goal, weights, targets and streaks.
-- What has another basis stays: the account and its subscription (the contract), ai_usage, the
-- consents, acceptances and withdrawals (the proof, Art. 7(1)), and what deleting the account and
-- changing its password keep. So does the user's own library, their foods, recipes, favourites and
-- exercises, which describe food and exercises rather than the user, for when they start again.
-- Without a profile, the app starts the onboarding again.
create function public.withdraw_health_consent()
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
  if not public.has_health_consent(caller_id) then
    raise exception 'There is no health data consent to withdraw' using errcode = 'BB062';
  end if;

  insert into public.health_data_consent_withdrawals (user_id) values (caller_id);
  perform public.end_ai_consent(caller_id);

  delete from public.meal_entries where user_id = caller_id;
  -- After the meals, whose delete records them here.
  delete from public.removed_meal_entries where user_id = caller_id;
  delete from public.water_days where user_id = caller_id;
  delete from public.step_days where user_id = caller_id;

  delete from public.workout_logs where user_id = caller_id;
  delete from public.outside_workouts where user_id = caller_id;
  delete from public.workout_moves where user_id = caller_id;
  delete from public.workouts where user_id = caller_id;
  delete from public.planned_days_kept where user_id = caller_id;
  delete from public.planned_days where user_id = caller_id;
  delete from public.applied_plans where user_id = caller_id;

  delete from public.day_nutrition_targets where user_id = caller_id;
  delete from public.own_nutrition_targets where user_id = caller_id;
  delete from public.streak_days where user_id = caller_id;
  delete from public.user_streaks where user_id = caller_id;
  delete from public.weight_entries where user_id = caller_id;
  delete from public.goals where user_id = caller_id;
  delete from public.profiles where user_id = caller_id;
end;
$$;

revoke execute on function public.withdraw_health_consent() from public, anon;
grant execute on function public.withdraw_health_consent() to authenticated;
