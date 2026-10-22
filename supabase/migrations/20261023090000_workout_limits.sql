-- How many workouts a user may have, and how many exercises each may have, depends on the user
-- (ADR 0018). For now every user has the free limits; premium will raise them. The app asks
-- workout_limits() instead of knowing the numbers, and save_workout() checks them.
--
-- A new error code:
--   BB009  the user already has as many workouts as they may have
--
-- The plan builder's workouts stay within the exercise limit (FREE_WORKOUT_EXERCISES in
-- supabase/functions/_shared/plan/limits.ts). They are not held to the workout limit: a plan may
-- have a workout for each of up to 6 training days.

-- The caller's limits: exercises in one workout, and workouts in all, archived ones included.
create function public.workout_limits()
returns table (exercises integer, workouts integer)
language sql
stable
set search_path = ''
as $$
  select 20, 5;
$$;

revoke execute on function public.workout_limits from public, anon;
grant execute on function public.workout_limits to authenticated;

-- Unchanged apart from the limits; the exercise limit was a fixed 20.
create or replace function public.save_workout(workout jsonb)
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

  insert into public.workout_exercises (
    workout_id, user_id, position, exercise_id, sets, target_reps_min, target_reps_max,
    target_seconds, target_meters, rest_seconds
  )
  select
    saved_id,
    caller_id,
    (e.ordinality - 1)::smallint,
    e.value ->> 'exerciseId',
    (e.value ->> 'sets')::smallint,
    (e.value #>> '{target,reps,min}')::smallint,
    (e.value #>> '{target,reps,max}')::smallint,
    (e.value #>> '{target,seconds}')::smallint,
    (e.value #>> '{target,meters}')::integer,
    (e.value ->> 'restSeconds')::smallint
  from jsonb_array_elements(items) with ordinality e;

  return saved_id;
end;
$$;
