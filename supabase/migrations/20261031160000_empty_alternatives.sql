-- A new alternative starts empty, any alternative can be duplicated, and an empty one can be put
-- in use (#367, ADR 0064). Changes add_workout_alternative(), use_workout_alternative() and
-- delete_workout_alternative() of 20261031120000_workout_alternatives.sql and
-- 20261031130000_alternative_defaults.sql, takes the time of a workout out of save_workout() of
-- 20261028220000_plan_changes_through_functions.sql, and has planned_workouts() of
-- 20261028210000_move_from_kept_days.sql say how many exercises each workout has.

-- The minutes a workout with the exercises `items` takes, as the plan builder counts them: five
-- to warm up and each exercise's time, three hours at most. Without exercises, the warm-up alone.
-- save_workout() and use_workout_alternative() count it alike.
create function public.workout_minutes(items jsonb)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select least(180, ceil((
    300 + coalesce((select sum(public.exercise_seconds(e)) from jsonb_array_elements(items) e), 0)
  ) / 60.0))::smallint;
$$;

-- Called only from functions that run as their owner (20261024130000_tighten_grants.sql).
revoke execute on function public.workout_minutes(jsonb) from public, anon, authenticated;

-- As before (20261028220000), with the time from workout_minutes().
create or replace function public.save_workout(workout jsonb, today date)
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

  minutes := public.workout_minutes(items);

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

-- add_workout_alternative() takes the alternative to copy, `source_alternative_id`, as a last
-- optional parameter, which needs the function dropped. An empty list of `exercises` adds an empty
-- alternative, which save_workout() would refuse, so it is not tried.
drop function public.add_workout_alternative(bigint, date, text, jsonb);

-- Adds an alternative to the caller's `workout_id`, named `name` (blank for none), and gives its
-- id. Its exercises are, in this order:
-- - a copy of `source_alternative_id`'s, an alternative of the same workout, with their sets and
--   rests; the one in use is copied from the workout;
-- - `exercises`: none for an empty alternative, filled in later through Edit once it is in use;
--   otherwise they must make a workout that save_workout() saves, which is tried on the device's
--   `today` and rolled back, so that its own checks refuse them now rather than when the
--   alternative is put in use. They are kept as saved_workout() reads them back;
-- - without either, a copy of the one in use.
-- The first one added makes the workout's own exercises the first alternative, in use. A workout
-- has at most 5 (BB041).
create function public.add_workout_alternative(
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
  max_alternatives integer := (select l.alternatives from public.workout_limits() l);
begin
  perform public.lock_own_workout(add_workout_alternative.workout_id);
  workout := public.saved_workout(add_workout_alternative.workout_id);

  if (
    select count(*) from public.workout_alternatives a
    where a.workout_id = add_workout_alternative.workout_id
  ) >= max_alternatives then
    raise exception 'A workout can have up to % alternatives', max_alternatives
      using errcode = 'BB041';
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

revoke all on function public.add_workout_alternative(bigint, date, text, jsonb, bigint)
  from public, anon;
grant execute on function public.add_workout_alternative(bigint, date, text, jsonb, bigint)
  to authenticated;

-- As before, and an empty alternative put in use leaves the workout without exercises, which
-- save_workout() would refuse: the days before today are kept as save_workout() keeps them, the
-- workout's exercises go, and its time is workout_minutes() of none, the warm-up alone. The app
-- shows such a workout as having no exercises yet and starts it only once it has one.
create or replace function public.use_workout_alternative(alternative_id bigint, today date)
returns void
language plpgsql
-- As add_workout_alternative().
security definer
set search_path = ''
as $$
declare
  chosen public.workout_alternatives :=
    public.lock_own_alternative(use_workout_alternative.alternative_id);
  workout jsonb;
begin
  if chosen.in_use then
    return;
  end if;

  workout := public.saved_workout(chosen.workout_id);
  update public.workout_alternatives a
  set exercises = workout -> 'exercises'
  where a.workout_id = chosen.workout_id and a.in_use;
  update public.workout_alternatives a
  set exercises = null
  where a.id = chosen.id;

  if jsonb_array_length(chosen.exercises) = 0 then
    perform public.keep_planned_days(use_workout_alternative.today);
    delete from public.workout_exercises e where e.workout_id = chosen.workout_id;
    update public.workouts w
    set estimated_minutes = public.workout_minutes('[]')
    where w.id = chosen.workout_id;
  else
    perform public.save_workout(
      workout || jsonb_build_object('exercises', chosen.exercises),
      use_workout_alternative.today
    );
  end if;
end;
$$;

-- As before (20261031120000), and the last other alternative is kept while the one in use has no
-- exercises (BB043): deleting it would leave the workout without alternatives and without
-- exercises, the ones it had gone with it. Exercises are added to the one in use first, or the
-- other is put in use.
create or replace function public.delete_workout_alternative(alternative_id bigint)
returns void
language plpgsql
-- As add_workout_alternative().
security definer
set search_path = ''
as $$
declare
  alternative public.workout_alternatives :=
    public.lock_own_alternative(delete_workout_alternative.alternative_id);
begin
  if alternative.in_use then
    raise exception 'The alternative in use cannot be deleted' using errcode = 'BB042';
  end if;
  if (
    select count(*) from public.workout_alternatives a where a.workout_id = alternative.workout_id
  ) = 2 and not exists (
    select 1 from public.workout_exercises e where e.workout_id = alternative.workout_id
  ) then
    raise exception 'The last other alternative of an empty workout cannot be deleted'
      using errcode = 'BB043';
  end if;
  delete from public.workout_alternatives a where a.id = alternative.id;

  -- A single one left is the workout itself, so it goes too.
  if (
    select count(*) from public.workout_alternatives a where a.workout_id = alternative.workout_id
  ) = 1 then
    delete from public.workout_alternatives a where a.workout_id = alternative.workout_id;
    return;
  end if;
  -- The others close the gap, in their order.
  update public.workout_alternatives a set position = n.position
  from (
    select o.id, row_number() over (order by o.position)::smallint as position
    from public.workout_alternatives o
    where o.workout_id = alternative.workout_id
  ) n
  where a.id = n.id and a.position <> n.position;
end;
$$;

-- As before (20261028210000), and how many exercises each workout has now, so that one without
-- any yet (ADR 0064) can be told; 0 for a deleted workout, whose kept days outlive it. A new
-- column in the result needs the function dropped.
drop function public.planned_workouts(date, date, date);
create function public.planned_workouts(from_day date, to_day date, today date)
returns table (
  day date,
  workout_id bigint,
  name text,
  type public.workout_type,
  exercise_count integer
)
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
  ),
  planned as (
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
  )
  select
    p.day,
    p.workout_id,
    p.name,
    p.type,
    (
      select count(*)::integer from public.workout_exercises e
      where e.workout_id = p.workout_id and e.user_id = (select auth.uid())
    ) as exercise_count
  from planned p
  order by 1, 2;
$$;

revoke execute on function public.planned_workouts(date, date, date) from public, anon;
grant execute on function public.planned_workouts(date, date, date) to authenticated;
