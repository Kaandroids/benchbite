-- Users create, edit and delete their own workouts (#72). A workout and its exercises are saved
-- together by save_workout(), which checks that every target suits what the exercise records and
-- estimates the workout's length the way the plan builder does.
--
-- Errors the app needs to tell apart have their own SQLSTATE codes:
--   BB006  the workout does not exist or belongs to someone else
--   BB007  a target does not suit what the exercise records
--   BB008  a workout needs 1 to 20 exercises

-- Whether a target suits an exercise's metrics: a rep range for exercises that record reps, a time
-- and/or a distance for those that record a distance, and a time for the others, such as planks.
create function public.target_suits(metrics public.exercise_metric[], target jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with given as (
    select
      jsonb_typeof(target -> 'reps') = 'object' as reps,
      coalesce(jsonb_typeof(target -> 'seconds') = 'number', false) as seconds,
      coalesce(jsonb_typeof(target -> 'meters') = 'number', false) as meters
  )
  select case
    when 'reps' = any(metrics) then coalesce(reps, false)
    when 'distance' = any(metrics) then reps is null and (seconds or meters)
    else reps is null and seconds and not meters
  end
  from given;
$$;

-- Seconds an exercise takes, as in the plan builder (supabase/functions/_shared/plan/session.ts):
-- 3 seconds a rep but at least 20 a set, the rest between sets and a minute to move on. A distance
-- without a time is counted at 6 minutes a kilometre.
create function public.exercise_seconds(exercise jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select
    (exercise ->> 'sets')::integer * case
      -- greatest() skips nulls, so a time or distance target must not reach it.
      when exercise #> '{target,reps}' is not null
        then greatest(20, (exercise #>> '{target,reps,max}')::integer * 3)
      else coalesce(
        (exercise #>> '{target,seconds}')::integer,
        round((exercise #>> '{target,meters}')::numeric * 0.36)::integer
      )
    end
    + ((exercise ->> 'sets')::integer - 1) * (exercise ->> 'restSeconds')::integer
    + 60;
$$;

-- Saves a workout with its exercises in order: a new one without an id, or replaces the name,
-- weekdays and exercises of the caller's workout with that id. Returns the workout's id. Whether
-- the workout is active is left as it is; new workouts are active.
create function public.save_workout(workout jsonb)
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
  minutes smallint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if jsonb_array_length(items) not between 1 and 20 then
    raise exception 'A workout needs 1 to 20 exercises' using errcode = 'BB008';
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

revoke execute on function public.save_workout from public, anon;
grant execute on function public.save_workout to authenticated;

-- Deleting a workout deletes its exercises with it.
create policy "Users delete their own workouts"
  on public.workouts for delete to authenticated
  using ((select auth.uid()) = user_id);
grant delete on public.workouts to authenticated;
