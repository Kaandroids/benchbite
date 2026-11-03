-- Workout limits by plan (#410, ADR 0079): workout_limits() reads the caller's plan, and what is
-- above it waits for premium. Waiting is `held`, apart from `active`, which stays the user's choice
-- to archive. apply_plan_limits() holds and lets go; triggers keep what is held from being used.
-- New error codes:
--   BB051  a workout or alternative waits for premium
--   BB052  a user has added as many alternatives as their plan allows
-- BB041 now counts the versions the caller's plan allows.

alter table public.workouts add column held boolean not null default false;
alter table public.workout_alternatives add column held boolean not null default false;
-- When an alternative was last the one in use, set as it stops being in use; null for one never in
-- use since it was added. apply_plan_limits() keeps the ones last in use.
alter table public.workout_alternatives add column last_used_at timestamptz;
-- The plan apply_plan_limits() last applied for each user, so that the sweep below applies only
-- plans that have changed since, such as one whose end has passed. It belongs to the workout limits,
-- apart from the subscriptions the store keeps; users neither read nor write it.
create table public.applied_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan public.plan not null
);

alter table public.applied_plans enable row level security;
revoke all on public.applied_plans from anon, authenticated;

-- The row of `plans` that `user_id` is on now.
create function public.plan_limits(user_id uuid)
returns public.plans
language sql
stable
set search_path = ''
as $$
  select p from public.plans p where p.plan = public.plan_of(plan_limits.user_id);
$$;

-- How many alternatives `user_id` has added to all their workouts, waiting ones included; the one
-- in use of each workout is the workout itself and does not count.
create function public.added_alternative_count(user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.workout_alternatives a
  where a.user_id = added_alternative_count.user_id and a.exercises is not null;
$$;

-- The caller's limits, from their plan (ADR 0078): `alternatives` is how many versions a workout
-- may have, its own exercises included, and `added_alternatives` how many a user may add in all,
-- null for no limit, with `alternatives_added`, how many they have, so that the app counts them as
-- the limit does. New columns change the result's type, so the function is made again; its callers
-- read the columns by name.
drop function public.workout_limits();
create function public.workout_limits()
returns table (
  exercises integer,
  workouts integer,
  alternatives integer,
  alternative_name_length integer,
  added_alternatives integer,
  alternatives_added integer
)
language sql
stable
-- Reads `plans` and plan_of(), which users may not.
security definer
set search_path = ''
as $$
  select p.exercises, p.workouts, p.versions, 12, p.added_alternatives,
    public.added_alternative_count((select auth.uid()))
  from public.plan_limits((select auth.uid())) p;
$$;

revoke execute on function public.workout_limits from public, anon;
grant execute on function public.workout_limits to authenticated;

-- A waiting workout plans no day; its days stay on it and come back with it.
create or replace function public.is_planned_by_weekdays(workout public.workouts, day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (is_planned_by_weekdays.workout).active
    and not (is_planned_by_weekdays.workout).held
    and extract(isodow from is_planned_by_weekdays.day)::smallint
      = any((is_planned_by_weekdays.workout).weekdays);
$$;

-- Holding a workout changes the plan, so the days before it are kept first, as for its days.
drop trigger workouts_keep_planned_days_on_change on public.workouts;
create trigger workouts_keep_planned_days_on_change
  before update of weekdays, active, held on public.workouts
  for each row
  when (
    old.weekdays is distinct from new.weekdays
    or old.active is distinct from new.active
    or old.held is distinct from new.held
  )
  execute function public.keep_planned_days_before_change();

-- Refuses using what waits for premium (BB051): it can be seen and deleted, nothing else. Any
-- column but `held` counts, so that one added later is guarded too.
create function public.refuse_held_workout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.held and new.held and (to_jsonb(old) - 'held') is distinct from (to_jsonb(new) - 'held') then
    raise exception 'The workout waits for premium' using errcode = 'BB051';
  end if;
  return new;
end;
$$;

create trigger workouts_refuse_held
  before update on public.workouts
  for each row execute function public.refuse_held_workout();

-- Whether `workout_id` waits for premium; false for one gone, as while it is being deleted.
create function public.is_held_workout(workout_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select w.held from public.workouts w where w.id = is_held_workout.workout_id),
    false
  );
$$;

-- A waiting workout's exercises do not change. A workout already done is still logged: the
-- database sees it only at the end, and not starting one that waits is left to the app.
create function public.refuse_held_workout_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  workout_id bigint := case when tg_op = 'DELETE' then old.workout_id else new.workout_id end;
begin
  if public.is_held_workout(workout_id) then
    raise exception 'The workout waits for premium' using errcode = 'BB051';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger workout_exercises_refuse_held
  before insert or update or delete on public.workout_exercises
  for each row execute function public.refuse_held_workout_rows();


-- As before (20261031160000), with the limits of the caller's plan: the versions a workout may have
-- (BB041) and the alternatives a user may add in all (BB052), read from workout_limits() as the
-- other workout functions read them. Every alternative is added here, so its limits are checked
-- here, beside each other.
create or replace function public.add_workout_alternative(
  workout_id bigint,
  today date,
  name text default null,
  exercises jsonb default null,
  source_alternative_id bigint default null
)
returns bigint
language plpgsql
-- Writes alternatives, which callers may only read, and reads saved_workout(), which they may not.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workout jsonb;
  source public.workout_alternatives;
  kept jsonb;
  added_id bigint;
  max_versions integer;
  max_added integer;
begin
  select l.alternatives, l.added_alternatives into max_versions, max_added
  from public.workout_limits() l;
  perform public.lock_own_workout(add_workout_alternative.workout_id);
  workout := public.saved_workout(add_workout_alternative.workout_id);

  -- A workout that waits gains none (BB051), which refuse_held_alternative() checks as it is added.
  -- The versions of the workout, its own first among them once it has an alternative, and the
  -- alternatives the user has added to all their workouts, waiting ones included.
  if (
    select count(*) from public.workout_alternatives a
    where a.workout_id = add_workout_alternative.workout_id
  ) >= max_versions then
    raise exception 'A workout can have up to % alternatives', max_versions
      using errcode = 'BB041';
  end if;
  if public.added_alternative_count(caller_id) >= max_added then
    raise exception 'A user can add up to % alternatives', max_added using errcode = 'BB052';
  end if;

  if add_workout_alternative.source_alternative_id is not null then
    if add_workout_alternative.exercises is not null then
      raise exception 'An alternative is a copy or has exercises, not both' using errcode = '22023';
    end if;
    -- Of the workout locked above, which is the caller's.
    select * into source from public.workout_alternatives a
    where a.id = add_workout_alternative.source_alternative_id
      and a.workout_id = add_workout_alternative.workout_id;
    if not found then
      raise exception 'Alternative not found' using errcode = 'P0002';
    end if;
    kept := coalesce(source.exercises, workout -> 'exercises');
  elsif add_workout_alternative.exercises is null then
    kept := workout -> 'exercises';
  else
    if jsonb_typeof(add_workout_alternative.exercises) <> 'array' then
      raise exception 'Exercises are a list' using errcode = '22023';
    end if;
    if jsonb_array_length(add_workout_alternative.exercises) = 0 then
      kept := '[]';
    else
      -- As propose_coach_change(): nothing but BBTRY may be caught here, or the tried workout
      -- would be kept. The variable keeps what was read before the rollback.
      begin
        perform public.save_workout(
          workout || jsonb_build_object('exercises', add_workout_alternative.exercises),
          add_workout_alternative.today
        );
        kept := public.saved_workout(add_workout_alternative.workout_id) -> 'exercises';
        raise exception 'Tried' using errcode = 'BBTRY';
      exception when sqlstate 'BBTRY' then
        null;
      end;
    end if;
  end if;

  if not exists (
    select 1 from public.workout_alternatives a
    where a.workout_id = add_workout_alternative.workout_id
  ) then
    insert into public.workout_alternatives (workout_id, user_id, position)
    values (add_workout_alternative.workout_id, caller_id, 1);
  end if;

  insert into public.workout_alternatives (workout_id, user_id, position, name, exercises)
  values (
    add_workout_alternative.workout_id,
    caller_id,
    (
      select max(a.position) + 1 from public.workout_alternatives a
      where a.workout_id = add_workout_alternative.workout_id
    ),
    nullif(btrim(add_workout_alternative.name), ''),
    kept
  )
  returning id into added_id;
  return added_id;
end;
$$;


-- A waiting workout gains no alternative and its alternatives change no exercises; a waiting
-- alternative is not put in use or renamed. Their order may change and they may be deleted.
create function public.refuse_held_alternative()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_held_workout(new.workout_id) then
      raise exception 'The workout waits for premium' using errcode = 'BB051';
    end if;
  elsif (old.name, old.exercises) is distinct from (new.name, new.exercises)
    and (old.held or public.is_held_workout(new.workout_id)) then
    raise exception 'The alternative waits for premium' using errcode = 'BB051';
  end if;
  return new;
end;
$$;

create trigger workout_alternatives_refuse_held
  before insert or update on public.workout_alternatives
  for each row execute function public.refuse_held_alternative();

-- Stamps an alternative as it stops being the one in use.
create function public.stamp_alternative_last_used()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_used_at := now();
  return new;
end;
$$;

create trigger workout_alternatives_stamp_last_used
  before update of exercises on public.workout_alternatives
  for each row
  when (old.exercises is null and new.exercises is not null)
  execute function public.stamp_alternative_last_used();

-- Holds `owner`'s workouts above `limits`, archived ones included, and lets them go once all fit:
-- while more are usable than the plan allows, the ones last trained stay, active before archived,
-- newer before older; the rest wait. Only apply_plan_limits() calls it, under the user's lock.
create function public.apply_workout_limits(owner uuid, limits public.plans)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.workouts w where w.user_id = apply_workout_limits.owner)
    <= limits.workouts then
    update public.workouts w set held = false
    where w.user_id = apply_workout_limits.owner and w.held;
  elsif (
    select count(*) from public.workouts w
    where w.user_id = apply_workout_limits.owner and not w.held
  ) > limits.workouts then
    update public.workouts w set held = true
    where w.id in (
      select u.id from public.workouts u
      where u.user_id = apply_workout_limits.owner and not u.held
      order by
        u.active desc,
        (select max(l.started_on) from public.workout_logs l where l.workout_id = u.id)
          desc nulls last,
        u.id desc
      offset limits.workouts
    );
  end if;
end;
$$;

-- Holds `owner`'s alternatives above `limits`, and lets them go once all fit: a waiting workout's
-- wait with it; of the others not in use, while more are usable than the plan allows, the ones last
-- in use stay, up to the versions a workout may have and the alternatives a user may add; the rest
-- wait. Only apply_plan_limits() calls it, under the user's lock and after the workouts.
create function public.apply_alternative_limits(owner uuid, limits public.plans)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.workout_alternatives a set held = true
  from public.workouts w
  where w.id = a.workout_id and w.held and a.user_id = apply_alternative_limits.owner
    and a.exercises is not null and not a.held;

  if not exists (
    select 1 from public.workout_alternatives a
    where a.user_id = apply_alternative_limits.owner
    group by a.workout_id
    having count(*) > limits.versions
  ) and (
    limits.added_alternatives is null
    or public.added_alternative_count(apply_alternative_limits.owner) <= limits.added_alternatives
  ) then
    update public.workout_alternatives a set held = false
    from public.workouts w
    where w.id = a.workout_id and not w.held and a.user_id = apply_alternative_limits.owner
      and a.held;
  else
    with usable as (
      -- The alternatives that may stay: not in use, not waiting, of a workout that does not wait.
      select a.id, a.workout_id, a.last_used_at
      from public.workout_alternatives a
      join public.workouts w on w.id = a.workout_id and not w.held
      where a.user_id = apply_alternative_limits.owner and a.exercises is not null and not a.held
    ), ranked_in_workout as (
      -- Each workout's, last in use first; the one in use is a version too.
      select u.*, row_number() over (
        partition by u.workout_id order by u.last_used_at desc nulls last, u.id desc
      ) as place
      from usable u
    ), kept as (
      -- The ones a workout may have, then the ones a user may add in all, last in use first.
      select o.id
      from (
        select r.id,
          row_number() over (order by r.last_used_at desc nulls last, r.id desc) as overall
        from ranked_in_workout r
        where r.place < limits.versions
      ) o
      where limits.added_alternatives is null or o.overall <= limits.added_alternatives
    )
    update public.workout_alternatives a set held = true
    where a.id in (select u.id from usable u) and a.id not in (select k.id from kept k);
  end if;
end;
$$;

-- Holds what is above `owner`'s plan, and lets it go once everything fits (ADR 0079), and records
-- the plan it applied. It never trades one for another: it holds only what is above the plan, and
-- lets go only of all.
create function public.apply_plan_limits(owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.plans;
begin
  -- The plan is read under the lock, so that one applied while this waited is not undone.
  perform public.lock_user_limits(apply_plan_limits.owner);
  limits := public.plan_limits(apply_plan_limits.owner);
  perform public.apply_workout_limits(apply_plan_limits.owner, limits);
  perform public.apply_alternative_limits(apply_plan_limits.owner, limits);
  insert into public.applied_plans (user_id, plan) values (apply_plan_limits.owner, limits.plan)
  on conflict (user_id) do update set plan = excluded.plan
  where public.applied_plans.plan is distinct from excluded.plan;
end;
$$;

-- A subscription given, changed or gone applies its plan at once.
create function public.apply_plan_limits_on_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  -- A user being deleted takes their subscription with them; there is nothing left to apply.
  if exists (select 1 from auth.users u where u.id = owner) then
    perform public.apply_plan_limits(owner);
  end if;
  return null;
end;
$$;

create trigger subscriptions_apply_plan_limits
  after insert or delete or update of plan, period_start, period_end on public.subscriptions
  for each row execute function public.apply_plan_limits_on_subscription();

-- Deleting a workout or alternative may make everything fit again, so the plan is applied after,
-- for each user who still has an account.
create function public.apply_plan_limits_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_plan_limits(g.user_id)
  from (select distinct d.user_id from gone d) g
  where exists (select 1 from auth.users u where u.id = g.user_id);
  return null;
end;
$$;

create trigger workouts_apply_plan_limits_after_delete
  after delete on public.workouts
  referencing old table as gone
  for each statement execute function public.apply_plan_limits_after_delete();
create trigger workout_alternatives_apply_plan_limits_after_delete
  after delete on public.workout_alternatives
  referencing old table as gone
  for each statement execute function public.apply_plan_limits_after_delete();

-- As before (20261028220000), with the user's limits locked first, as save_workout() locks them, so
-- that holding workouts, which takes that lock and then theirs, never waits on this the other way
-- round.
create or replace function public.set_workout_active(workout_id bigint, active boolean, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits((select auth.uid()));
  -- The workout's row before the plan's lock, so that two changes never wait on each other.
  perform 1 from public.workouts w
  where w.id = set_workout_active.workout_id and w.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  perform public.keep_planned_days(set_workout_active.today);
  update public.workouts w
  set active = set_workout_active.active
  where w.id = set_workout_active.workout_id;
end;
$$;

-- As before (20261028220000), and a waiting workout is not moved, as an archived one is not.
create or replace function public.move_fits(
  source public.workouts, from_on date, to_on date, on_day date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select source.active
    and not source.held
    and public.plans_workout_on(source, from_on, on_day)
    and date_trunc('week', from_on)
      between date_trunc('week', on_day - 1) and date_trunc('week', on_day + 1)
    and (
      to_on is null
      or (
        to_on <> from_on
        and date_trunc('week', to_on) = date_trunc('week', from_on)
        and to_on >= on_day - 1
        and not (
          public.is_planned_by_weekdays(source, to_on)
          and not exists (
            select 1 from public.workout_moves m
            where m.workout_id = source.id and m.from_on = move_fits.to_on
          )
        )
        and not exists (
          select 1 from public.workout_moves m
          where m.workout_id = source.id and m.to_on = move_fits.to_on
            and m.from_on <> move_fits.from_on
        )
      )
    );
$$;

-- As before (20261029110000), a waiting workout leaving the plan as an archived one does: a move to
-- a day not yet kept is settled, so that the workout is planned on no day while it waits.
create or replace function public.settle_moves(workout public.workouts, kept date, deleted boolean)
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
        or (settle_moves.workout).held
        or (
          m.from_on > settle_moves.kept
          and not public.is_planned_by_weekdays(settle_moves.workout, m.from_on)
        )
        or (
          public.is_planned_by_weekdays(settle_moves.workout, m.to_on)
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
  update public.workout_moves m set to_on = null, settled = true
  from stale s
  where m.id = s.id and not s.later;
end;
$$;

-- As before (20261028220000), with the user's limits locked first, as save_workout() locks them, so
-- that the plan applied after the delete waits for no lock this already holds the other way round.
create or replace function public.delete_workout(workout_id bigint, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits((select auth.uid()));
  -- The workout's row before the plan's lock, as in set_workout_active().
  perform 1 from public.workouts w
  where w.id = delete_workout.workout_id and w.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  perform public.keep_planned_days(delete_workout.today);
  delete from public.workouts w where w.id = delete_workout.workout_id;
end;
$$;

-- The users whose plan changed since it was last applied, such as one whose end has passed.
create function public.apply_changed_plan_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.apply_plan_limits(s.user_id)
  from public.subscriptions s
  left join public.applied_plans a on a.user_id = s.user_id
  where a.plan is distinct from public.plan_of(s.user_id);
$$;

revoke execute on function public.plan_limits(uuid), public.refuse_held_workout(),
  public.is_held_workout(bigint), public.refuse_held_workout_rows(),
  public.added_alternative_count(uuid), public.refuse_held_alternative(),
  public.stamp_alternative_last_used(), public.apply_workout_limits(uuid, public.plans),
  public.apply_alternative_limits(uuid, public.plans), public.apply_plan_limits(uuid),
  public.apply_plan_limits_on_subscription(), public.apply_plan_limits_after_delete(),
  public.apply_changed_plan_limits()
  from public, anon, authenticated;

select cron.schedule(
  'apply-plan-limits', '*/10 * * * *', 'select public.apply_changed_plan_limits()'
);

-- The free limit on alternatives applies to everyone now; the plans given so far are applied too.
select public.apply_plan_limits(u.id) from auth.users u;
