-- The consent to read the phone's health store, Apple Health or Health Connect (#711, ADR 0166).
-- The system's own permission dialog names neither Benchbite nor what the data is for, so the app
-- asks first, in a sheet that says both, and records the answer here. Like the other consents, an
-- entry is never changed, so the history shows which version was given and when it ended; both
-- are deleted with the user.
create table public.health_app_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null check (store in ('apple_health', 'health_connect')),
  consent_version text not null check (length(consent_version) between 1 and 32),
  granted_at timestamptz not null default now()
);

create index health_app_consents_user_id_idx on public.health_app_consents (user_id);

-- When the user disconnected the store, which ends the consent.
create table public.health_app_consent_withdrawals (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  withdrawn_at timestamptz not null default now()
);

create index health_app_consent_withdrawals_user_id_idx
  on public.health_app_consent_withdrawals (user_id);

-- Users read their own; only the functions below write them.
alter table public.health_app_consents enable row level security;
alter table public.health_app_consent_withdrawals enable row level security;

create policy "Users read their own health app consents"
  on public.health_app_consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their own health app consent withdrawals"
  on public.health_app_consent_withdrawals for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.health_app_consents, public.health_app_consent_withdrawals
  from anon, authenticated;
grant select on public.health_app_consents, public.health_app_consent_withdrawals
  to authenticated;

-- Whether the user has a consent to read the store given after their last withdrawal of it.
create function public.has_health_app_consent(user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.health_app_consents c
    where c.user_id = has_health_app_consent.user_id
      and c.granted_at > coalesce(
        (select max(w.withdrawn_at) from public.health_app_consent_withdrawals w
          where w.user_id = has_health_app_consent.user_id),
        '-infinity'
      )
  );
$$;

revoke execute on function public.has_health_app_consent(uuid) from public, anon, authenticated;

-- Records the caller's consent to read the store, with the version of the sheet's text. It rests
-- on the health data consent of the onboarding: without that one, nothing may be read (BB067).
create function public.give_health_app_consent(store text, consent_version text)
returns void
language plpgsql
-- Writes the consents, which callers may not.
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
    raise exception 'The health data consent is needed first'
      using errcode = 'BB067';
  end if;
  insert into public.health_app_consents (user_id, store, consent_version)
  values (caller_id, give_health_app_consent.store, give_health_app_consent.consent_version);
end;
$$;

revoke execute on function public.give_health_app_consent(text, text) from public, anon;
grant execute on function public.give_health_app_consent(text, text) to authenticated;

-- Ends the caller's consent to read the store, as disconnecting it does. Nothing read is deleted:
-- it is part of the logs under the health data consent (ADR 0166).
create function public.withdraw_health_app_consent()
returns void
language plpgsql
-- Writes the withdrawals, which callers may not.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if public.has_health_app_consent(caller_id) then
    insert into public.health_app_consent_withdrawals (user_id) values (caller_id);
  end if;
end;
$$;

revoke execute on function public.withdraw_health_app_consent() from public, anon;
grant execute on function public.withdraw_health_app_consent() to authenticated;

-- Whether the caller's consent to read the store holds now, for the app to ask before it reads.
create function public.my_health_app_consent()
returns boolean
language sql
stable
-- Asks the consent rule, which is closed to clients.
security definer
set search_path = ''
as $$
  select public.has_health_app_consent((select auth.uid()));
$$;

revoke execute on function public.my_health_app_consent() from public, anon;
grant execute on function public.my_health_app_consent() to authenticated;

-- Both are part of the user's data export (ADR 0147), as the other consents are.
create or replace function public.export_tables()
returns table (name text, order_by text)
language sql
immutable
set search_path = ''
as $$
  values
    ('profiles', 'user_id'),
    ('goals', 'user_id'),
    ('weight_entries', 'measured_on'),
    ('own_nutrition_targets', 'user_id'),
    ('day_nutrition_targets', 'day'),
    ('applied_plans', 'user_id'),
    ('workouts', 'id'),
    ('workout_exercises', 'id'),
    ('workout_alternatives', 'id'),
    ('workout_moves', 'id'),
    ('planned_days', 'day'),
    ('planned_days_kept', 'user_id'),
    ('workout_logs', 'id'),
    ('logged_sets', 'id'),
    ('outside_workouts', 'started_at'),
    ('meal_entries', 'id'),
    ('water_days', 'day'),
    ('step_days', 'day'),
    ('streak_days', 'day'),
    ('user_streaks', 'user_id'),
    ('custom_foods', 'id'),
    ('favourite_foods', 'id'),
    ('coach_notes', 'id'),
    ('coach_meal_cards', 'id'),
    ('coach_proposals', 'id'),
    ('health_data_consents', 'id'),
    ('health_data_consent_withdrawals', 'id'),
    ('ai_consents', 'id'),
    ('ai_consent_withdrawals', 'id'),
    ('health_app_consents', 'id'),
    ('health_app_consent_withdrawals', 'id'),
    ('terms_acceptances', 'id'),
    ('subscriptions', 'user_id'),
    ('password_changes', 'changed_at');
$$;

-- As before, and the consent to read the store ends with the health data consent it rests on.
create or replace function public.withdraw_health_consent_of(user_id uuid)
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
  -- Reading the store rests on this consent too: it ends with it.
  if public.has_health_app_consent(owner_id) then
    insert into public.health_app_consent_withdrawals (user_id) values (owner_id);
  end if;

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
