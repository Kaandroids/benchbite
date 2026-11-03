-- Workout limits by plan (#410, ADR 0079): workout_limits() reads the caller's plan, and what is
-- above it waits for premium. Waiting is `held`, apart from `active`, which stays the user's choice
-- to archive. apply_plan_limits() holds and lets go; triggers keep what is held from being used.
-- New error codes:
--   BB051  a workout or alternative waits for premium
--   BB052  a user has added as many alternatives as their plan allows

alter table public.workouts add column held boolean not null default false;
alter table public.workout_alternatives add column held boolean not null default false;
-- When an alternative was last the one in use, set as it stops being in use; null for one never in
-- use since it was added. apply_plan_limits() keeps the ones last in use.
alter table public.workout_alternatives add column last_used_at timestamptz;
-- The plan apply_plan_limits() last applied for the subscription's user, so that the sweep below
-- applies only plans that have changed since, such as one whose end has passed.
alter table public.subscriptions add column applied_plan public.plan;

-- The row of `plans` that `user_id` is on now.
create function public.plan_limits(user_id uuid)
returns public.plans
language sql
stable
set search_path = ''
as $$
  select p from public.plans p where p.plan = public.plan_of(plan_limits.user_id);
$$;

-- The caller's limits, from their plan (ADR 0078): `alternatives` is how many versions a workout
-- may have, its own exercises included, and `added_alternatives` how many a user may add in all,
-- null for no limit. A new column changes the result's type, so the function is made again; its
-- callers read the columns by name.
drop function public.workout_limits();
create function public.workout_limits()
returns table (
  exercises integer,
  workouts integer,
  alternatives integer,
  alternative_name_length integer,
  added_alternatives integer
)
language sql
stable
-- Reads `plans` and plan_of(), which users may not.
security definer
set search_path = ''
as $$
  select p.exercises, p.workouts, p.versions, 12, p.added_alternatives
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
-- database sees it only at the end, and starting one that waits is refused by the app.
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

-- An alternative of a waiting workout gains none and changes no exercises; a waiting alternative is
-- not put in use or renamed. Their order may change and they may be deleted. Adding one checks the
-- alternatives a user may add in all (BB052). The versions of one workout stay checked by
-- add_workout_alternative(), as it counts them before it adds the workout's own as the first.
create function public.check_alternative()
returns trigger
language plpgsql
-- Reads the owner's plan, which users may not.
security definer
set search_path = ''
as $$
declare
  most integer;
begin
  if tg_op = 'INSERT' then
    if public.is_held_workout(new.workout_id) then
      raise exception 'The workout waits for premium' using errcode = 'BB051';
    end if;
    most := (public.plan_limits(new.user_id)).added_alternatives;
    if new.exercises is not null and most is not null and (
      select count(*) from public.workout_alternatives a
      where a.user_id = new.user_id and a.exercises is not null
    ) >= most then
      raise exception 'A user can add up to % alternatives', most using errcode = 'BB052';
    end if;
  elsif (old.name, old.exercises) is distinct from (new.name, new.exercises)
    and (old.held or public.is_held_workout(new.workout_id)) then
    raise exception 'The alternative waits for premium' using errcode = 'BB051';
  end if;
  return new;
end;
$$;

create trigger workout_alternatives_check
  before insert or update on public.workout_alternatives
  for each row execute function public.check_alternative();

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

-- Holds what is above `owner`'s plan, and lets it go once everything fits (ADR 0079):
-- - workouts, archived ones included: while more are usable than the plan allows, the ones last
--   trained stay, active before archived, newer before older; the rest wait;
-- - alternatives not in use: while more are usable than the plan allows, the ones last in use stay,
--   up to the versions a workout may have and the alternatives a user may add; the rest wait. A
--   waiting workout's all wait.
-- It never trades one for another: it holds only what is above the plan, and lets go only of all.
create function public.apply_plan_limits(owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.plans := public.plan_limits(apply_plan_limits.owner);
begin
  perform public.lock_user_limits(apply_plan_limits.owner);

  if (select count(*) from public.workouts w where w.user_id = apply_plan_limits.owner)
    <= limits.workouts then
    update public.workouts w set held = false
    where w.user_id = apply_plan_limits.owner and w.held;
  elsif (
    select count(*) from public.workouts w where w.user_id = apply_plan_limits.owner and not w.held
  ) > limits.workouts then
    update public.workouts w set held = true
    where w.id in (
      select u.id from public.workouts u
      where u.user_id = apply_plan_limits.owner and not u.held
      order by
        u.active desc,
        (select max(l.started_on) from public.workout_logs l where l.workout_id = u.id)
          desc nulls last,
        u.id desc
      offset limits.workouts
    );
  end if;

  -- A waiting workout's alternatives wait with it.
  update public.workout_alternatives a set held = true
  from public.workouts w
  where w.id = a.workout_id and w.held and a.user_id = apply_plan_limits.owner
    and a.exercises is not null and not a.held;

  if not exists (
    select 1 from public.workout_alternatives a
    where a.user_id = apply_plan_limits.owner
    group by a.workout_id
    having count(*) > limits.versions
  ) and (
    limits.added_alternatives is null
    or (
      select count(*) from public.workout_alternatives a
      where a.user_id = apply_plan_limits.owner and a.exercises is not null
    ) <= limits.added_alternatives
  ) then
    update public.workout_alternatives a set held = false
    from public.workouts w
    where w.id = a.workout_id and not w.held and a.user_id = apply_plan_limits.owner and a.held;
  else
    with usable as (
      -- The alternatives that may stay: not in use, not waiting, of a workout that does not wait.
      select a.id, a.workout_id, a.last_used_at
      from public.workout_alternatives a
      join public.workouts w on w.id = a.workout_id and not w.held
      where a.user_id = apply_plan_limits.owner and a.exercises is not null and not a.held
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
        select r.id, row_number() over (order by r.last_used_at desc nulls last, r.id desc) as overall
        from ranked_in_workout r
        where r.place < limits.versions
      ) o
      where limits.added_alternatives is null or o.overall <= limits.added_alternatives
    )
    update public.workout_alternatives a set held = true
    where a.id in (select u.id from usable u) and a.id not in (select k.id from kept k);
  end if;

  update public.subscriptions s
  set applied_plan = limits.plan
  where s.user_id = apply_plan_limits.owner and s.applied_plan is distinct from limits.plan;
end;
$$;

-- A subscription given, changed or gone applies its plan at once.
create function public.apply_plan_limits_on_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_plan_limits(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
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

-- The users whose plan changed since it was last applied, such as one whose end has passed.
create function public.apply_changed_plan_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.apply_plan_limits(s.user_id)
  from public.subscriptions s
  where s.applied_plan is distinct from public.plan_of(s.user_id);
$$;

revoke execute on function public.plan_limits(uuid), public.refuse_held_workout(),
  public.is_held_workout(bigint), public.refuse_held_workout_rows(), public.check_alternative(),
  public.stamp_alternative_last_used(), public.apply_plan_limits(uuid),
  public.apply_plan_limits_on_subscription(), public.apply_plan_limits_after_delete(),
  public.apply_changed_plan_limits()
  from public, anon, authenticated;

select cron.schedule(
  'apply-plan-limits', '*/10 * * * *', 'select public.apply_changed_plan_limits()'
);

-- The free limit on alternatives applies to everyone now; the plans given so far are applied too.
select public.apply_plan_limits(u.id) from auth.users u;
