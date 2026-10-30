-- A new alternative starts empty, any alternative can be duplicated, and an empty one can be put
-- in use (#367, ADR 0064). Changes add_workout_alternative() and use_workout_alternative() of
-- 20261031120000_workout_alternatives.sql and 20261031130000_alternative_defaults.sql.

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
-- workout's exercises go, and its time is the warm-up alone, as save_workout() counts it. The app
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
    update public.workouts w set estimated_minutes = 5 where w.id = chosen.workout_id;
  else
    perform public.save_workout(
      workout || jsonb_build_object('exercises', chosen.exercises),
      use_workout_alternative.today
    );
  end if;
end;
$$;
