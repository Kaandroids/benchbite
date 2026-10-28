-- Each past day keeps the workouts it was planned with, so that changing the plan changes the
-- days from today on and leaves past days, and what was done, missed or skipped on them, as they
-- were (#241, ADR 0041). Days keep their nutrition targets in the same way (ADR 0040).

-- The workouts planned on a day before it was kept: the active ones on its weekday. Written only
-- by keep_user_planned_days(). The workout's id, name and type stay when it is deleted, so that a
-- kept day still says which workout it planned, and which of them a move took.
create table public.planned_days (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  workout_id bigint not null,
  name text,
  type public.workout_type
);

create unique index planned_days_workout_day_key
  on public.planned_days (user_id, day, workout_id);

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

-- The latest day that is past on every device: the day before the earliest the device's today can
-- be, a day before the server's (the window of assert_device_today()). Days through it can be kept
-- without asking the device.
create function public.last_day_past_everywhere()
returns date
language sql
stable
set search_path = ''
as $$
  select current_date - 2;
$$;

revoke execute on function public.last_day_past_everywhere() from public, anon, authenticated;

-- Refuses a day that cannot be the device's today: more than one from the server's.
create function public.assert_device_today(today date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if assert_device_today.today is null
    or assert_device_today.today not between current_date - 1 and current_date + 1 then
    raise exception 'Today is the device''s today' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.assert_device_today(date) from public, anon, authenticated;

-- The device's today as sent, when it can be one by assert_device_today(); else the server's, for
-- a call that must not fail on a device clock that is off.
create function public.device_today_or_server(sent text)
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select t.day
      from (
        select case
          when device_today_or_server.sent ~ '^\d{4}-\d{2}-\d{2}$'
            then device_today_or_server.sent::date
        end as day
      ) t
      where t.day between current_date - 1 and current_date + 1
    ),
    current_date
  );
$$;

revoke execute on function public.device_today_or_server(text) from public, anon, authenticated;

-- Makes the calls that keep a user's days wait for each other, until the transaction ends.
create function public.lock_planned_days(owner uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtextextended('planned_days ' || lock_planned_days.owner::text, 0)
  );
$$;

revoke execute on function public.lock_planned_days(uuid) from public, anon, authenticated;

-- The workouts a user's plan as it is now puts on each day from `from_day` to `to_day`: the
-- active ones on the day's weekday. Keeping days and reading days both take the plan from here,
-- so that a day reads the same before and after it is kept. Only those two call it.
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

revoke execute on function public.plan_by_weekdays(uuid, date, date)
  from public, anon, authenticated;

-- Keeps a user's plan as it is now for the days after the last kept one, up to `through`. Days
-- already kept are never written again: calls for a user wait for each other, and the last kept
-- day only moves forward. A user without kept days starts there without any: the plan before it
-- is not known. Returns the last kept day.
create function public.keep_user_planned_days(owner uuid, through date)
returns date
language plpgsql
-- Writes planned_days and planned_days_kept, which users may only read.
security definer
set search_path = ''
as $$
declare
  kept date;
begin
  perform public.lock_planned_days(owner);
  kept := (select k.through from public.planned_days_kept k where k.user_id = owner);
  if kept >= keep_user_planned_days.through then
    return kept;
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
  return keep_user_planned_days.through;
end;
$$;

revoke execute on function public.keep_user_planned_days(uuid, date)
  from public, anon, authenticated;

-- Starts a user's plan on `today`, the device's day the onboarding is finished: days before it had
-- none, so they are kept without any. Only complete_onboarding() calls it.
create function public.start_user_plan(owner uuid, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_device_today(start_user_plan.today);
  perform public.lock_planned_days(owner);
  insert into public.planned_days_kept (user_id, through, started_on)
  values (owner, start_user_plan.today - 1, start_user_plan.today)
  on conflict (user_id) do update
  set through = greatest(public.planned_days_kept.through, excluded.through),
    started_on = coalesce(public.planned_days_kept.started_on, excluded.started_on);
end;
$$;

revoke execute on function public.start_user_plan(uuid, date) from public, anon, authenticated;

-- Keeps the caller's plan through the day before `today`, the device's today, so that a change
-- made next counts from today. The functions that change the plan call it first.
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
  perform public.assert_device_today(keep_planned_days.today);
  perform public.keep_user_planned_days((select auth.uid()), keep_planned_days.today - 1);
end;
$$;

revoke execute on function public.keep_planned_days(date) from public, anon;
grant execute on function public.keep_planned_days(date) to authenticated;

-- A deleted workout's moves stay on the days that keep them, with its id, as the kept days keep
-- it; the trigger below deletes those of later days, as the cascade did. Moves are written only
-- by the database, for workouts that exist then.
alter table public.workout_moves drop constraint workout_moves_workout_id_fkey;

-- Settles a workout's moves when the plan changes to `workout`, or the workout is deleted. A move
-- into a kept day, or within kept days, stays as it went. Of the moves into later days, those that
-- no longer fit go, unless they come from a kept day: that one becomes a skip of it, which frees
-- the day it was moved to and leaves the kept day as it went. A move no longer fits when the
-- workout leaves the plan (archived or deleted), when its day is no longer one of the workout's,
-- or when it lands on one of the workout's own days.
create function public.settle_moves(workout public.workouts, kept date, deleted boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  with stale as (
    select m.id, m.from_on > settle_moves.kept as later
    from public.workout_moves m
    where m.workout_id = (settle_moves.workout).id
      and (m.to_on > settle_moves.kept or (m.to_on is null and m.from_on > settle_moves.kept))
      and (
        settle_moves.deleted
        or not (settle_moves.workout).active
        or (
          m.from_on > settle_moves.kept
          and not extract(isodow from m.from_on)::smallint = any((settle_moves.workout).weekdays)
        )
        or (
          extract(isodow from m.to_on)::smallint = any((settle_moves.workout).weekdays)
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

revoke execute on function public.settle_moves(public.workouts, date, boolean)
  from public, anon, authenticated;

-- Whatever changes the plan, the days before it are kept first with the plan they had, and the
-- workout's moves are settled. The app keeps the days through the device's yesterday beforehand;
-- this keeps them through the last day past on every device in any case, so that no change
-- reaches a past day but the device's today is never kept. A user being deleted keeps nothing.
create function public.keep_planned_days_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed public.workouts := case when tg_op = 'DELETE' then old else new end;
  kept date;
begin
  if not exists (select 1 from auth.users u where u.id = changed.user_id) then
    return changed;
  end if;
  kept := public.keep_user_planned_days(changed.user_id, public.last_day_past_everywhere());
  if tg_op <> 'INSERT' then
    perform public.settle_moves(changed, kept, tg_op = 'DELETE');
  end if;
  return changed;
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

-- Settling moves is now part of the trigger above (20261024210000 did it after a change).
drop trigger workouts_drop_stale_moves on public.workouts;
drop function public.drop_stale_moves();

-- The caller's planned workouts on each day from `from_day` to `to_day`, a year at most: kept
-- days as they were kept, and today, the device's today, and later days by the plan as it is.
-- Days before the plan started have none. Everything that shows or counts the plan of a day reads
-- this. A deleted workout's days keep its id, though the workout is gone: show their name and type.
create function public.planned_workouts(from_day date, to_day date, today date)
returns table (day date, workout_id bigint, name text, type public.workout_type)
language sql
stable
-- Calls plan_by_weekdays(), which users may not; it reads the caller's rows only.
security definer
set search_path = ''
as $$
  with bounds as (
    select
      -- Never today or later, even when the server kept a day ahead of the device's.
      least(k.through, planned_workouts.today - 1) as kept,
      greatest(planned_workouts.from_day, k.started_on) as first_day,
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

-- As before (20261026090000), and with the device's today keeps the days before it first, in the
-- same transaction as the change (ADR 0041). The app sends it; without it, the trigger keeps
-- the days the server knows to be past.
drop function public.save_workout(jsonb);
create function public.save_workout(workout jsonb, today date default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  saved_id bigint := (workout ->> 'id')::bigint;
  items jsonb := coalesce(workout -> 'exercises', '[]');
  days smallint[] := array(
    select value::smallint from jsonb_array_elements_text(coalesce(workout -> 'weekdays', '[]'))
  );
  max_exercises integer;
  max_workouts integer;
  minutes smallint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  perform public.lock_user_limits(caller_id);
  -- The days before the device's today keep the plan they had (ADR 0041), after the workout's row
  -- is locked, as in set_workout_active(). `today` is optional only until the app sends it.
  if saved_id is not null then
    perform 1 from public.workouts w where w.id = saved_id and w.user_id = caller_id for update;
  end if;
  if save_workout.today is not null then
    perform public.keep_planned_days(save_workout.today);
  end if;

  select l.exercises, l.workouts into max_exercises, max_workouts from public.workout_limits() l;

  if jsonb_array_length(items) not between 1 and max_exercises then
    raise exception 'A workout needs 1 to % exercises', max_exercises using errcode = 'BB008';
  end if;
  -- Workouts from the plan builder count too, archived ones as well.
  if saved_id is null
    and (select count(*) from public.workouts w where w.user_id = caller_id) >= max_workouts then
    raise exception 'A user can have up to % workouts', max_workouts using errcode = 'BB009';
  end if;
  -- Unknown exercises are left to the foreign key.
  if exists (
    select 1
    from jsonb_array_elements(items) e
    join public.exercises x on x.id = e ->> 'exerciseId'
    where not public.target_suits(x.metrics, e -> 'target')
  ) then
    raise exception 'A target does not suit its exercise' using errcode = 'BB007';
  end if;

  -- Five minutes to warm up, as in the plan builder.
  minutes := least(180, ceil((
    300 + (select sum(public.exercise_seconds(e)) from jsonb_array_elements(items) e)
  ) / 60.0));

  if saved_id is null then
    insert into public.workouts (user_id, name, weekdays, estimated_minutes)
    values (caller_id, workout ->> 'name', days, minutes)
    returning id into saved_id;
  else
    update public.workouts w
    set name = workout ->> 'name', weekdays = days, estimated_minutes = minutes
    where w.id = saved_id and w.user_id = caller_id;
    if not found then
      raise exception 'Workout not found' using errcode = 'BB006';
    end if;
    delete from public.workout_exercises where workout_id = saved_id;
  end if;

  -- A slot belongs to a plan's exercises only, so one sent with a hand-made workout is dropped.
  perform public.insert_workout_exercises(
    saved_id,
    caller_id,
    (
      select coalesce(jsonb_agg(e.value - 'slot' order by e.ordinality), '[]'::jsonb)
      from jsonb_array_elements(items) with ordinality e
    )
  );

  return saved_id;
end;
$$;


revoke execute on function public.save_workout(jsonb, date) from public, anon;
grant execute on function public.save_workout(jsonb, date) to authenticated;

-- Archives a workout or brings it back, keeping the days before the device's today first.
create function public.set_workout_active(workout_id bigint, active boolean, today date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- The workout's row before the plan's lock, in the order a direct change takes them, so that the
  -- two never wait on each other.
  perform 1 from public.workouts w where w.id = set_workout_active.workout_id for update;
  perform public.keep_planned_days(set_workout_active.today);
  update public.workouts w
  set active = set_workout_active.active
  where w.id = set_workout_active.workout_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
end;
$$;

revoke execute on function public.set_workout_active(bigint, boolean, date) from public, anon;
grant execute on function public.set_workout_active(bigint, boolean, date) to authenticated;

-- Deletes a workout, keeping the days before the device's today first.
create function public.delete_workout(workout_id bigint, today date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- The workout's row before the plan's lock, as in set_workout_active().
  perform 1 from public.workouts w where w.id = delete_workout.workout_id for update;
  perform public.keep_planned_days(delete_workout.today);
  delete from public.workouts w where w.id = delete_workout.workout_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
end;
$$;

revoke execute on function public.delete_workout(bigint, date) from public, anon;
grant execute on function public.delete_workout(bigint, date) to authenticated;

-- As before (20261026180000), and starts the plan on the device's today, `answers.today`.
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

  -- The plan starts on the device's today, sent with the answers (ADR 0041), before any
  -- workout of it is saved. Without one, or with a device clock more than a day off, it starts on
  -- the server's, so that the onboarding can always be finished.
  perform public.start_user_plan(caller_id, public.device_today_or_server(answers ->> 'today'));

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

-- As before (20261028190000), with the device's today checked as everywhere else: within a day of
-- the server's.
create or replace function public.refresh_day_nutrition_targets(from_day date)
returns void
language plpgsql
-- Writes day_nutrition_targets, which callers may only read.
security definer
set search_path = ''
as $$
declare
  targets public.nutrition_targets := public.my_nutrition_targets();
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(refresh_day_nutrition_targets.from_day);
  if targets.calories is null then
    return;
  end if;
  update public.day_nutrition_targets d
  set calories = targets.calories,
    protein_g = targets.protein_g,
    carbs_g = targets.carbs_g,
    fat_g = targets.fat_g
  where d.user_id = (select auth.uid()) and d.day >= refresh_day_nutrition_targets.from_day;
end;
$$;

-- Days before this migration keep the plan as it is now, the closest there is to the one they had:
-- from the day each user finished the onboarding, or a guest saved their first workout, through
-- the last day past on every device.
insert into public.planned_days_kept (user_id, through, started_on)
select u.user_id, u.first_day - 1, u.onboarded_on
from (
  select w.user_id,
    coalesce(min(p.onboarding_completed_at)::date, min(w.created_at)::date) as first_day,
    min(p.onboarding_completed_at)::date as onboarded_on
  from public.workouts w
  left join public.profiles p on p.user_id = w.user_id
  group by w.user_id
  union
  select p.user_id, p.onboarding_completed_at::date, p.onboarding_completed_at::date
  from public.profiles p
  where p.onboarding_completed_at is not null
    and not exists (select 1 from public.workouts w where w.user_id = p.user_id)
) u
on conflict (user_id) do nothing;

-- Set at once without the lock of keep_user_planned_days(): nothing else runs during the
-- migration, and a lock per user would be held until it ends.
insert into public.planned_days (user_id, day, workout_id, name, type)
select k.user_id, p.day, p.workout_id, p.name, p.type
from public.planned_days_kept k
cross join lateral public.plan_by_weekdays(
  k.user_id, k.through + 1, public.last_day_past_everywhere()
) p
on conflict do nothing;

update public.planned_days_kept
set through = greatest(through, public.last_day_past_everywhere());
