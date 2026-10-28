-- Each past day keeps the workouts it was planned with, so that changing the plan changes the
-- days from today on and leaves past days, and what was done, missed or skipped on them, as they
-- were (#241, ADR 0041). Days keep their nutrition targets in the same way (ADR 0040).

-- The workouts planned on a day before it was kept: the active ones on its weekday. Written only
-- by keep_user_planned_days(). The name and type stay when the workout is deleted.
create table public.planned_days (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  workout_id bigint references public.workouts (id) on delete set null,
  name text,
  type public.workout_type
);

create unique index planned_days_workout_day_key
  on public.planned_days (user_id, day, workout_id);
create index planned_days_workout_id_idx on public.planned_days (workout_id);

-- How far each user's plan is kept, and the day it started. Days up to `through` are planned as
-- planned_days says, none of a day's rows meaning a day without workouts, and later days by the
-- plan as it is. Days before `started_on`, the device's day the onboarding was finished, had no
-- plan.
create table public.planned_days_kept (
  user_id uuid primary key references auth.users (id) on delete cascade,
  through date not null,
  started_on date
);

alter table public.planned_days enable row level security;
alter table public.planned_days_kept enable row level security;

create policy "Users read the planned workouts of their days"
  on public.planned_days for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read how far their plan is kept"
  on public.planned_days_kept for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.planned_days, public.planned_days_kept from anon;
revoke insert, update, delete, truncate on public.planned_days, public.planned_days_kept
  from authenticated;

-- The workouts a user's plan as it is now puts on each day from `from_day` to `to_day`: the
-- active ones on the day's weekday. Keeping days and reading days both take the plan from here,
-- so that a day reads the same before and after it is kept. Runs as its caller, so users only
-- reach their own workouts.
create function public.plan_by_weekdays(owner uuid, from_day date, to_day date)
returns table (day date, workout_id bigint, name text, type public.workout_type)
language sql
stable
set search_path = ''
as $$
  select d::date, w.id, w.name, w.type
  from generate_series(plan_by_weekdays.from_day, plan_by_weekdays.to_day, '1 day') d
  join public.workouts w
    on w.user_id = plan_by_weekdays.owner
    and w.active
    and extract(isodow from d)::smallint = any(w.weekdays);
$$;

revoke execute on function public.plan_by_weekdays(uuid, date, date) from public, anon;
grant execute on function public.plan_by_weekdays(uuid, date, date) to authenticated;

-- Keeps a user's plan as it is now for the days after the last kept one, up to `through`. Days
-- already kept are never written again: calls for a user wait for each other, and the last kept
-- day only moves forward. A user without kept days starts there without any: the plan before it
-- is not known.
create function public.keep_user_planned_days(owner uuid, through date)
returns void
language plpgsql
-- Writes planned_days and planned_days_kept, which users may only read.
security definer
set search_path = ''
as $$
declare
  kept date;
begin
  perform pg_advisory_xact_lock(hashtextextended('planned_days ' || owner::text, 0));
  kept := (select k.through from public.planned_days_kept k where k.user_id = owner);
  if kept >= keep_user_planned_days.through then
    return;
  end if;
  if kept is not null then
    insert into public.planned_days (user_id, day, workout_id, name, type)
    select owner, p.day, p.workout_id, p.name, p.type
    from public.plan_by_weekdays(owner, kept + 1, keep_user_planned_days.through) p
    on conflict do nothing;
  end if;
  insert into public.planned_days_kept (user_id, through)
  values (owner, keep_user_planned_days.through)
  on conflict (user_id) do update
  set through = greatest(public.planned_days_kept.through, excluded.through);
end;
$$;

revoke execute on function public.keep_user_planned_days(uuid, date)
  from public, anon, authenticated;

-- Keeps the caller's plan through the day before `today`, the device's today: the app calls it
-- before changing the plan, so that the change counts from today. The server's date may be a day
-- apart, so no other day is taken.
create function public.keep_planned_days(today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if keep_planned_days.today not between current_date - 1 and current_date + 1 then
    raise exception 'Today is the device''s today' using errcode = '22023';
  end if;
  perform public.keep_user_planned_days((select auth.uid()), keep_planned_days.today - 1);
end;
$$;

revoke execute on function public.keep_planned_days(date) from public, anon;
grant execute on function public.keep_planned_days(date) to authenticated;

-- A deleted workout's moves stay on the days that keep them: the move points at no workout then,
-- as the kept day does. Moves from later days go with the workout, as before.
alter table public.workout_moves
  alter column workout_id drop not null,
  drop constraint workout_moves_workout_id_fkey,
  add constraint workout_moves_workout_id_fkey
    foreign key (workout_id) references public.workouts (id) on delete set null;

-- Moves of a workout that no longer fit the plan: those from days after the last kept one go, and
-- one from a kept day becomes a skip of it, which frees the day it was moved to while the kept day
-- stays as it went. A move wholly within kept days stays. `whole` is true when the workout leaves
-- the plan, as when it is archived or deleted; otherwise the plan is its new weekdays.
create function public.drop_stale_moves_of(
  workout public.workouts, kept date, whole boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  with stale as (
    select m.id, m.from_on > drop_stale_moves_of.kept as later
    from public.workout_moves m
    where m.workout_id = (drop_stale_moves_of.workout).id
      and (m.from_on > drop_stale_moves_of.kept or m.to_on > drop_stale_moves_of.kept)
      and (
        drop_stale_moves_of.whole
        or (
          m.from_on > drop_stale_moves_of.kept
          and not extract(isodow from m.from_on)::smallint = any((drop_stale_moves_of.workout).weekdays)
        )
        or (
          extract(isodow from m.to_on)::smallint = any((drop_stale_moves_of.workout).weekdays)
          and not exists (
            select 1 from public.workout_moves o
            where o.workout_id = m.workout_id and o.from_on = m.to_on
          )
        )
      )
  ),
  dropped as (
    delete from public.workout_moves m using stale s where m.id = s.id and s.later
  )
  update public.workout_moves m set to_on = null
  from stale s
  where m.id = s.id and not s.later;
end;
$$;

revoke execute on function public.drop_stale_moves_of(public.workouts, date, boolean)
  from public, anon, authenticated;

-- Whatever changes the plan, the days before it are kept first with the plan they had. The app
-- keeps them through the device's yesterday beforehand; this keeps them through the day before
-- the server's yesterday in any case, which is past on every device, so that no change reaches a
-- past day but the device's today is never kept. A deleted workout's moves are settled here, as
-- its row is gone afterwards. A user being deleted keeps nothing.
create function public.keep_planned_days_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if not exists (select 1 from auth.users u where u.id = owner) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  perform public.keep_user_planned_days(owner, current_date - 2);
  if tg_op = 'DELETE' then
    perform public.drop_stale_moves_of(
      old,
      (select k.through from public.planned_days_kept k where k.user_id = owner),
      true
    );
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_planned_days_before_change()
  from public, anon, authenticated;

create trigger workouts_keep_planned_days_on_change
  before update of weekdays, active on public.workouts
  for each row
  when (old.weekdays is distinct from new.weekdays or old.active is distinct from new.active)
  execute function public.keep_planned_days_before_change();
create trigger workouts_keep_planned_days_on_add_or_delete
  before insert or delete on public.workouts
  for each row execute function public.keep_planned_days_before_change();

-- Settles the moves that no longer fit when a workout's weekdays change or it is archived, after
-- the trigger above kept the days (20261024210000). Without a kept day, which that trigger always
-- writes first, the days from the day before the server's yesterday count as kept.
create or replace function public.drop_stale_moves()
returns trigger
language plpgsql
-- Calls drop_stale_moves_of(), which users may not.
security definer
set search_path = ''
as $$
begin
  perform public.drop_stale_moves_of(
    new,
    coalesce(
      (select k.through from public.planned_days_kept k where k.user_id = new.user_id),
      current_date - 2
    ),
    not new.active
  );
  return null;
end;
$$;

-- The caller's planned workouts on each day from `from_day` to `to_day`, a year at most: kept
-- days as they were kept, and today, the device's today, and later days by the plan as it is.
-- Days before the plan started have none. Everything that shows or counts the plan of a day reads
-- this. A deleted workout's days have no workout id.
create function public.planned_workouts(from_day date, to_day date, today date)
returns table (day date, workout_id bigint, name text, type public.workout_type)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      -- Never today or later, even when the server kept a day ahead of the device's.
      least(k.through, planned_workouts.today - 1) as kept,
      greatest(
        planned_workouts.from_day,
        coalesce(
          k.started_on,
          (
            select p.onboarding_completed_at::date from public.profiles p
            where p.user_id = (select auth.uid())
          )
        )
      ) as first_day,
      least(planned_workouts.to_day, planned_workouts.from_day + 366) as last_day
    from (select 1) one
    left join public.planned_days_kept k on k.user_id = (select auth.uid())
  )
  select p.day, p.workout_id, p.name, p.type
  from public.planned_days p, bounds b
  where p.user_id = (select auth.uid())
    and p.day between b.first_day and least(b.last_day, b.kept)
  union all
  select p.day, p.workout_id, p.name, p.type
  from bounds b
  cross join lateral public.plan_by_weekdays(
    (select auth.uid()), greatest(b.first_day, coalesce(b.kept + 1, b.first_day)), b.last_day
  ) p
  order by 1, 2;
$$;

revoke execute on function public.planned_workouts(date, date, date) from public, anon;
grant execute on function public.planned_workouts(date, date, date) to authenticated;

-- The device's day the onboarding is finished starts the plan, so that neither the days before it
-- nor today are lost to the server's date. The app sends it with the answers as `today`; a day
-- more than one from the server's, or none, takes the server's.
create function public.start_plan_with_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := current_date;
  sent text := current_setting('benchbite.onboarding_today', true);
begin
  if sent ~ '^\d{4}-\d{2}-\d{2}$' and sent::date between current_date - 1 and current_date + 1 then
    today := sent::date;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planned_days ' || new.user_id::text, 0));
  insert into public.planned_days_kept (user_id, through, started_on)
  values (new.user_id, today - 1, today)
  on conflict (user_id) do update
  set through = greatest(public.planned_days_kept.through, excluded.through),
    started_on = coalesce(public.planned_days_kept.started_on, excluded.started_on);
  return null;
end;
$$;

revoke execute on function public.start_plan_with_onboarding() from public, anon, authenticated;

create trigger profiles_start_plan
  after insert or update of onboarding_completed_at on public.profiles
  for each row
  when (new.onboarding_completed_at is not null)
  execute function public.start_plan_with_onboarding();

-- As before (20261026180000), and passes the device's today, `answers.today`, to the trigger above.
create or replace function public.complete_onboarding(answers jsonb, plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Named apart from the tables' columns, so that queries cannot confuse the two.
  caller_id uuid := (select auth.uid());
  goal public.goal_kind := (answers ->> 'goal')::public.goal_kind;
  training_days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(answers -> 'trainingDays')
  );
  session jsonb;
  new_workout_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.user_id = caller_id and p.onboarding_completed_at is not null
  ) then
    raise exception 'The onboarding is already completed' using errcode = 'BB001';
  end if;

  -- The app checks these too; the server must not rely on it. The minimum age is checked by the
  -- profiles table.
  if coalesce(answers ->> 'consentedPolicyVersion', '') = '' then
    raise exception 'Health data consent is required' using errcode = 'BB003';
  end if;
  -- Every training day is in exactly one session.
  if (
    select array_agg(d.value::smallint order by d.value::smallint)
    from jsonb_array_elements(plan -> 'sessions') s,
      jsonb_array_elements_text(s -> 'weekdays') d
  ) is distinct from (select array_agg(d order by d) from unnest(training_days) d) then
    raise exception 'The plan does not match the training days' using errcode = 'BB004';
  end if;
  perform public.lock_user_limits(caller_id);
  -- Workouts a guest saved before finishing the onboarding count too.
  if jsonb_array_length(plan -> 'sessions')
    + (select count(*) from public.workouts w where w.user_id = caller_id)
    > (select l.workouts from public.workout_limits() l) then
    raise exception 'A user can have up to % workouts', (select l.workouts from public.workout_limits() l)
      using errcode = 'BB009';
  end if;
  -- A plan's workouts stay shorter than the 20 exercises a user may build: the plan builder fills
  -- at most 12 (PLAN_WORKOUT_EXERCISES), and never leaves one empty.
  if exists (
    select 1 from jsonb_array_elements(plan -> 'sessions') s
    where coalesce(jsonb_array_length(s -> 'exercises'), 0) not between 1 and 12
  ) then
    raise exception 'A session needs 1 to 12 exercises' using errcode = 'BB005';
  end if;
  -- Each target suits what its exercise records, as save_workout() checks; a workout would
  -- otherwise start with sets that its log refuses. Unknown exercises are left to the foreign key.
  if exists (
    select 1
    from jsonb_array_elements(plan -> 'sessions') s,
      jsonb_array_elements(s -> 'exercises') e
    join public.exercises x on x.id = e.value ->> 'exerciseId'
    where not public.target_suits(x.metrics, e.value -> 'target')
  ) then
    raise exception 'A target does not suit its exercise' using errcode = 'BB007';
  end if;

  -- The device's today starts the plan (profiles_start_plan, ADR 0041); the server's without it.
  perform set_config('benchbite.onboarding_today', coalesce(answers ->> 'today', ''), true);

  insert into public.profiles (
    user_id, sex, birth_year, height_cm, weight_unit, height_unit, activity_level, experience,
    training_setup, training_days, session_minutes, display_name, onboarding_completed_at
  )
  values (
    caller_id,
    (answers ->> 'sex')::public.sex,
    (answers ->> 'birthYear')::integer,
    (answers ->> 'heightCm')::numeric,
    (answers ->> 'weightUnit')::public.weight_unit,
    (answers ->> 'heightUnit')::public.height_unit,
    (answers ->> 'activityLevel')::public.activity_level,
    (answers ->> 'experience')::public.experience,
    (answers ->> 'setup')::public.training_setup,
    training_days,
    (answers ->> 'sessionMinutes')::smallint,
    -- Optional: a skipped or blank name is no name. The table checks the rest.
    nullif(btrim(answers ->> 'displayName'), ''),
    now()
  );

  -- Only goals that change the weight keep a target weight and a pace.
  insert into public.goals (user_id, kind, target_weight_kg, weekly_pace_kg)
  values (
    caller_id,
    goal,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'targetWeightKg')::numeric end,
    case when goal in ('lose_fat', 'build_muscle') then (answers ->> 'weeklyPaceKg')::numeric end
  );

  insert into public.weight_entries (user_id, weight_kg)
  values (caller_id, (answers ->> 'weightKg')::numeric);

  insert into public.health_data_consents (user_id, policy_version)
  values (caller_id, answers ->> 'consentedPolicyVersion');

  for session in select value from jsonb_array_elements(plan -> 'sessions') loop
    insert into public.workouts (user_id, weekdays, type, estimated_minutes)
    values (
      caller_id,
      array(select value::smallint from jsonb_array_elements_text(session -> 'weekdays')),
      (session ->> 'type')::public.workout_type,
      (session ->> 'estimatedMinutes')::smallint
    )
    returning id into new_workout_id;

    -- The exercises in order; conditioning for fat loss is the last of them.
    perform public.insert_workout_exercises(new_workout_id, caller_id, session -> 'exercises');
  end loop;
end;
$$;

-- Days before this migration keep the plan as it is now, the closest there is to the one they had,
-- from the day each user finished the onboarding. Through the day before the server's yesterday,
-- as the trigger keeps, so that no device's today is kept.
insert into public.planned_days_kept (user_id, through, started_on)
select p.user_id, p.onboarding_completed_at::date - 1, p.onboarding_completed_at::date
from public.profiles p
where p.onboarding_completed_at is not null
on conflict (user_id) do nothing;

do $$
begin
  perform public.keep_user_planned_days(p.user_id, current_date - 2)
  from public.profiles p
  where p.onboarding_completed_at is not null;
end;
$$;
