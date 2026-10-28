-- The plan changes only through the functions that take the device's today, and one rule says
-- which days the plan puts a workout on (#257, ADR 0041).

-- Whether the plan as it is puts the workout on `day`: active, on one of its weekdays. Keeping
-- days, reading them, judging moves and settling moves all ask this.
create function public.is_planned_by_weekdays(workout public.workouts, day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (is_planned_by_weekdays.workout).active
    and extract(isodow from is_planned_by_weekdays.day)::smallint
      = any((is_planned_by_weekdays.workout).weekdays);
$$;

revoke execute on function public.is_planned_by_weekdays(public.workouts, date)
  from public, anon, authenticated;

-- As before (20261028200000), by is_planned_by_weekdays().
create or replace function public.plan_by_weekdays(owner uuid, from_day date, to_day date)
returns table (day date, workout_id bigint, name text, type public.workout_type)
language sql
stable
set search_path = ''
as $$
  select d::date, w.id, w.name, w.type
  from generate_series(plan_by_weekdays.from_day, plan_by_weekdays.to_day, '1 day') d
  join public.workouts w
    on w.user_id = plan_by_weekdays.owner
    and public.is_planned_by_weekdays(w, d::date);
$$;

-- As before (20261028210000), by is_planned_by_weekdays() for a day that is not kept.
create or replace function public.plans_workout_on(workout public.workouts, day date, on_day date)
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
    else public.is_planned_by_weekdays(plans_workout_on.workout, plans_workout_on.day)
  end;
$$;

-- As before (20261028210000), with a move's target judged by is_planned_by_weekdays().
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

-- As before (20261028200000), by is_planned_by_weekdays().
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
  update public.workout_moves m set to_on = null
  from stale s
  where m.id = s.id and not s.later;
end;
$$;

-- The device's today is now required: every app build sends it (#256).
drop function public.save_workout(jsonb, date);
create function public.save_workout(workout jsonb, today date)
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
  -- is locked, as in set_workout_active().
  if saved_id is not null then
    perform 1 from public.workouts w where w.id = saved_id and w.user_id = caller_id for update;
  end if;
  perform public.keep_planned_days(save_workout.today);

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

-- Archiving and deleting run with the owner's rights now, as clients may no longer write workouts
-- themselves; they reach the caller's own workout only.
create or replace function public.set_workout_active(workout_id bigint, active boolean, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create or replace function public.delete_workout(workout_id bigint, today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

-- Clients change the plan only through the functions above, which keep the days before the
-- device's today first. The trigger still keeps the days past on every device for any other path.
drop policy "Users update their own workouts" on public.workouts;
drop policy "Users delete their own workouts" on public.workouts;
revoke update, delete on public.workouts from authenticated;
