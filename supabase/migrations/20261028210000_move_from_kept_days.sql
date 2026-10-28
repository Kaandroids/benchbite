-- A kept day plans the workouts it kept (ADR 0041), so a missed workout on it can be moved or
-- skipped, though its weekdays have changed since. A later day is still planned by the weekdays.

-- Whether `day` plans the workout: as kept, for a day kept before `today`, the device's today;
-- otherwise, or without kept days, by its weekdays, as planned_workouts() reads the days.
create function public.plans_workout_on(workout public.workouts, day date, today date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when plans_workout_on.day <= (
      select least(k.through, plans_workout_on.today - 1)
      from public.planned_days_kept k
      where k.user_id = (plans_workout_on.workout).user_id
    )
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
