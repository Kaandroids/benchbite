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

-- The last day each user's plan is kept through: days up to it are planned as planned_days says,
-- none of a day's rows meaning a day without workouts, and later days by the plan as it is.
create table public.planned_days_kept (
  user_id uuid primary key references auth.users (id) on delete cascade,
  through date not null
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
    select owner, d::date, w.id, w.name, w.type
    from generate_series(kept + 1, keep_user_planned_days.through, '1 day') d
    join public.workouts w
      on w.user_id = owner
      and w.active
      and extract(isodow from d)::smallint = any(w.weekdays)
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

-- Whatever changes the plan, the days before it are kept first with the plan they had. The app
-- keeps them through the device's yesterday beforehand; this keeps them through the day before
-- the server's yesterday in any case, which is past on every device, so that no change reaches a
-- past day but the device's today is never kept. A user being deleted keeps nothing.
create function public.keep_planned_days_before_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if exists (select 1 from auth.users u where u.id = owner) then
    perform public.keep_user_planned_days(owner, current_date - 2);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
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

-- A move that no longer fits the plan is deleted unless it lies wholly within kept days, which
-- keep their moves and skips with the plan they were made for (20261024210000). The trigger above
-- has always kept the days by the time this runs, so the user has a last kept day.
create or replace function public.drop_stale_moves()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  kept date := (select k.through from public.planned_days_kept k where k.user_id = new.user_id);
begin
  delete from public.workout_moves m
  where m.workout_id = new.id
    and (m.from_on > kept or m.to_on > kept)
    and (
      not new.active
      -- A kept day keeps the plan the move was made from.
      or (m.from_on > kept and not extract(isodow from m.from_on)::smallint = any(new.weekdays))
      or (
        extract(isodow from m.to_on)::smallint = any(new.weekdays)
        and not exists (
          select 1 from public.workout_moves o
          where o.workout_id = m.workout_id and o.from_on = m.to_on
        )
      )
    );
  return null;
end;
$$;

-- The caller's planned workouts on each day from `from_day` to `to_day`: kept days as they were
-- kept, and today, the device's today, and later days by the plan as it is. Days before the
-- onboarding have none. Everything that shows or counts the plan of a day reads this.
create function public.planned_workouts(from_day date, to_day date, today date)
returns table (day date, workout_id bigint, name text, type public.workout_type)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      -- Never today or later, even when the server kept a day ahead of the device's.
      (
        select least(k.through, planned_workouts.today - 1)
        from public.planned_days_kept k
        where k.user_id = (select auth.uid())
      ) as kept,
      greatest(
        planned_workouts.from_day,
        (
          select p.onboarding_completed_at::date from public.profiles p
          where p.user_id = (select auth.uid())
        )
      ) as first_day
  )
  select p.day, p.workout_id, p.name, p.type
  from public.planned_days p, bounds b
  where p.user_id = (select auth.uid())
    and p.day between b.first_day and least(planned_workouts.to_day, b.kept)
  union all
  select d::date, w.id, w.name, w.type
  from bounds b
  cross join generate_series(
    greatest(b.first_day, coalesce(b.kept + 1, b.first_day)), planned_workouts.to_day, '1 day'
  ) d
  join public.workouts w
    on w.user_id = (select auth.uid())
    and w.active
    and extract(isodow from d)::smallint = any(w.weekdays)
  order by 1, 2;
$$;

revoke execute on function public.planned_workouts(date, date, date) from public, anon;
grant execute on function public.planned_workouts(date, date, date) to authenticated;

-- Days before this migration keep the plan as it is now, the closest there is to the one they had,
-- from the day each user finished the onboarding.
insert into public.planned_days_kept (user_id, through)
select p.user_id, p.onboarding_completed_at::date - 1
from public.profiles p
where p.onboarding_completed_at is not null;

do $$
begin
  perform public.keep_user_planned_days(p.user_id, current_date - 1)
  from public.profiles p
  where p.onboarding_completed_at is not null;
end;
$$;
