-- Workout limits by plan (#410, ADR 0079): workout_limits() reads the caller's plan, and what is
-- above it waits for premium. Waiting is `held`, apart from `active`, which stays the user's choice
-- to archive. apply_plan_limits() holds and lets go; triggers keep what is held from being used.

alter table public.workouts add column held boolean not null default false;
alter table public.workout_alternatives add column held boolean not null default false;
-- When an alternative was last the one in use, set as it stops being in use; null for one never in
-- use since it was added. apply_plan_limits() keeps the ones last in use.
alter table public.workout_alternatives add column last_used_at timestamptz;

-- The caller's limits, from their plan's row (ADR 0078): `alternatives` is how many versions a
-- workout may have, its own exercises included, and `added_alternatives` how many a user may add
-- in all, null for no limit. A new column changes the result's type, so the function is made
-- again; its callers read the columns by name.
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
  from public.plans p
  where p.plan = public.plan_of((select auth.uid()));
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

-- Refuses using what waits for premium (BB044): it can be seen and deleted, nothing else.
create function public.refuse_held_workout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.held and new.held and (
    old.name, old.type, old.weekdays, old.active, old.estimated_minutes
  ) is distinct from (
    new.name, new.type, new.weekdays, new.active, new.estimated_minutes
  ) then
    raise exception 'The workout waits for premium' using errcode = 'BB044';
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

-- A waiting workout's exercises do not change, and it is not logged.
create function public.refuse_held_workout_rows()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  workout_id bigint := case when tg_op = 'DELETE' then old.workout_id else new.workout_id end;
begin
  if public.is_held_workout(workout_id) then
    raise exception 'The workout waits for premium' using errcode = 'BB044';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger workout_exercises_refuse_held
  before insert or update or delete on public.workout_exercises
  for each row execute function public.refuse_held_workout_rows();
create trigger workout_logs_refuse_held
  before insert on public.workout_logs
  for each row execute function public.refuse_held_workout_rows();

-- An alternative of a waiting workout gains none and changes no exercises; a waiting alternative is
-- not put in use or renamed. Their order may change and they may be deleted. Adding one checks the
-- alternatives a user may add in all (BB045); the versions of a workout add_workout_alternative()
-- checks. One that stops being in use is stamped.
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
      raise exception 'The workout waits for premium' using errcode = 'BB044';
    end if;
    most := (
      select p.added_alternatives from public.plans p
      where p.plan = public.plan_of(new.user_id)
    );
    if new.exercises is not null and most is not null and (
      select count(*) from public.workout_alternatives a
      where a.user_id = new.user_id and a.exercises is not null
    ) >= most then
      raise exception 'A user can add up to % alternatives', most using errcode = 'BB045';
    end if;
    return new;
  end if;

  if (old.name, old.exercises) is distinct from (new.name, new.exercises)
    and (old.held or public.is_held_workout(new.workout_id)) then
    raise exception 'The alternative waits for premium' using errcode = 'BB044';
  end if;
  if old.exercises is null and new.exercises is not null then
    new.last_used_at := now();
  end if;
  return new;
end;
$$;

create trigger workout_alternatives_check
  before insert or update on public.workout_alternatives
  for each row execute function public.check_alternative();

revoke execute on function public.refuse_held_workout(), public.is_held_workout(bigint),
  public.refuse_held_workout_rows(), public.check_alternative()
  from public, anon, authenticated;

-- Holds what is above `owner`'s plan, and lets it go once everything fits (ADR 0079):
-- - workouts, archived ones included: while more are usable than the plan allows, the ones last
--   trained stay, active before archived, newer before older; the rest wait;
-- - alternatives not in use: while more are usable than the plan allows, the ones last in use stay,
--   up to the versions a workout may have and the alternatives a user may add; the rest wait, and
--   so do all of a waiting workout's.
-- It never trades one for another: it holds only what is above the plan, and lets go only of all.
create function public.apply_plan_limits(owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.plans := (
    select p from public.plans p where p.plan = public.plan_of(apply_plan_limits.owner)
  );
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
    where a.user_id = apply_plan_limits.owner and a.held;
  else
    update public.workout_alternatives a set held = true
    where a.user_id = apply_plan_limits.owner and not a.held and a.exercises is not null
      and a.id not in (
        select k.id from (
          select r.id, row_number() over (order by r.last_used_at desc nulls last, r.id desc) as n
          from (
            select a2.id, a2.last_used_at,
              row_number() over (
                partition by a2.workout_id order by a2.last_used_at desc nulls last, a2.id desc
              ) as in_workout
            from public.workout_alternatives a2
            join public.workouts w on w.id = a2.workout_id
            where a2.user_id = apply_plan_limits.owner
              and a2.exercises is not null and not a2.held and not w.held
          ) r
          where r.in_workout < limits.versions
        ) k
        where limits.added_alternatives is null or k.n <= limits.added_alternatives
      );
  end if;
end;
$$;

revoke execute on function public.apply_plan_limits(uuid) from public, anon, authenticated;

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

revoke execute on function public.apply_plan_limits_on_subscription()
  from public, anon, authenticated;

create trigger subscriptions_apply_plan_limits
  after insert or update or delete on public.subscriptions
  for each row execute function public.apply_plan_limits_on_subscription();

-- Every user with a subscription, for plans whose end has passed since they last changed.
create function public.apply_all_plan_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.apply_plan_limits(s.user_id) from public.subscriptions s;
$$;

revoke execute on function public.apply_all_plan_limits() from public, anon, authenticated;

select cron.schedule('apply-plan-limits', '*/10 * * * *', 'select public.apply_all_plan_limits()');

-- The free limit on alternatives applies to everyone now; the plans given so far are applied too.
select public.apply_plan_limits(u.id) from auth.users u;
