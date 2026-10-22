-- How many exercises a workout may have depends on the user (ADR 0018). For now every user has the
-- free limit of 10; premium will raise it. The app asks max_workout_exercises() instead of knowing
-- the number, and save_workout() checks it. Plans from the plan builder stay within the free limit
-- (FREE_WORKOUT_EXERCISES in supabase/functions/_shared/plan/limits.ts).

-- The most exercises the caller's workouts may have.
create function public.max_workout_exercises()
returns integer
language sql
stable
set search_path = ''
as $$
  select 10;
$$;

revoke execute on function public.max_workout_exercises from public, anon;
grant execute on function public.max_workout_exercises to authenticated;

-- Unchanged apart from the limit, which was 20 for everyone.
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
  limit_exercises integer := public.max_workout_exercises();
  minutes smallint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if jsonb_array_length(items) not between 1 and limit_exercises then
    raise exception 'A workout needs 1 to % exercises', limit_exercises using errcode = 'BB008';
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
