-- A kept day plans the workouts it kept (ADR 0041), so a missed workout on it can be moved or
-- skipped, though its weekdays have changed since. A later day is still planned by the weekdays.

-- The last kept day of a user's plan that is no later than `latest`; null without kept days.
-- Reading days caps it at the device's yesterday, so that today follows the plan; moving caps it
-- at the server's today, which no kept day passes (ADR 0041).
create function public.kept_through(owner uuid, latest date)
returns date
language sql
stable
set search_path = ''
as $$
  select least(k.through, kept_through.latest)
  from public.planned_days_kept k
  where k.user_id = kept_through.owner;
$$;

revoke execute on function public.kept_through(uuid, date) from public, anon, authenticated;

-- Whether `day` plans the workout, as seen on `on_day`, the server's date a move is judged on: as
-- kept, for a kept day; otherwise, or without kept days, by its weekdays, as planned_workouts()
-- plans the days. Unlike that read, days before the plan started need no cutoff here: they are
-- kept without workouts.
create function public.plans_workout_on(workout public.workouts, day date, on_day date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when plans_workout_on.day
      <= public.kept_through((plans_workout_on.workout).user_id, plans_workout_on.on_day)
      then exists (
        select 1 from public.planned_days p
        where p.user_id = (plans_workout_on.workout).user_id
          and p.day = plans_workout_on.day
          and p.workout_id = (plans_workout_on.workout).id
      )
    else extract(isodow from plans_workout_on.day)::smallint
      = any((plans_workout_on.workout).weekdays)
  end;
$$;

revoke execute on function public.plans_workout_on(public.workouts, date, date)
  from public, anon, authenticated;

-- As before (20261024200000), with the day a move starts from planned as plans_workout_on() says.
create or replace function public.move_fits(
  source public.workouts, from_on date, to_on date, on_day date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select source.active
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
          extract(isodow from to_on)::smallint = any(source.weekdays)
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

-- As before (20261028200000), with the kept day from kept_through().
create or replace function public.planned_workouts(from_day date, to_day date, today date)
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
      public.kept_through((select auth.uid()), planned_workouts.today - 1) as kept,
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
