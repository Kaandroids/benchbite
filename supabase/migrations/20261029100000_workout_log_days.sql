-- A finished workout keeps the device's day it started on, as meal entries keep theirs (ADR 0034),
-- so that the streak can tell which day a workout counts for (ADR 0044). The start's time alone
-- does not say it, as the server does not know the device's time zone. It also keeps the workout
-- it was started from after that workout is deleted, as the days it was planned on keep it
-- (ADR 0041).

alter table public.workout_logs
  add column started_on date,
  -- Unlike `workout_id`, kept when the workout is deleted.
  add column source_workout_id bigint;

-- A log written without the device's day, as by an app from before, keeps the start's day in UTC,
-- the closest there is to the device's.
create function public.default_started_on()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.started_on := coalesce(new.started_on, (new.started_at at time zone 'UTC')::date);
  return new;
end;
$$;

revoke execute on function public.default_started_on() from public, anon, authenticated;

create trigger workout_logs_default_started_on
  before insert on public.workout_logs
  for each row execute function public.default_started_on();

-- Logs from before keep the start's day in UTC, and the workout they still name.
update public.workout_logs
set started_on = (started_at at time zone 'UTC')::date, source_workout_id = workout_id;

alter table public.workout_logs alter column started_on set not null;

create index workout_logs_user_id_started_on_idx on public.workout_logs (user_id, started_on);

-- As before (20261025090000), with the device's day of the start, `startedOn`, within a day of
-- the start in UTC. An app from before sends none, but a move to the day the workout started on,
-- which is the device's. The move is checked against that day.
create or replace function public.log_workout(log jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source_id bigint := (log ->> 'workoutId')::bigint;
  started timestamptz := (log ->> 'startedAt')::timestamptz;
  finished timestamptz := (log ->> 'finishedAt')::timestamptz;
  device_day date := (log ->> 'startedOn')::date;
  log_client_id uuid := (log ->> 'clientId')::uuid;
  move_from date := (log #>> '{move,from}')::date;
  move_to date := (log #>> '{move,to}')::date;
  source public.workouts;
  new_log_id bigint;
  log_day date;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if log_client_id is not null then
    select l.id into new_log_id
    from public.workout_logs l
    where l.user_id = caller_id and l.client_id = log_client_id;
    if found then
      return new_log_id;
    end if;
  end if;

  -- An app from before sends no day, but a move to the day the workout started on, the device's.
  if device_day is null and abs(move_to - (started at time zone 'UTC')::date) <= 1 then
    device_day := move_to;
  end if;

  if started is null or finished is null or finished <= started
    or finished - started > interval '12 hours' or finished > now() + interval '5 minutes'
    or abs(device_day - (started at time zone 'UTC')::date) > 1 then
    raise exception 'The workout''s start and end do not make sense' using errcode = 'BB012';
  end if;

  select * into source from public.workouts w where w.id = source_id and w.user_id = caller_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;

  perform public.check_sets(log);

  -- Two copies of one log arriving at once: the second inserts nothing and returns the first.
  insert into public.workout_logs (
    user_id, workout_id, source_workout_id, name, type, started_at, started_on, finished_at,
    planned_exercises, planned_sets, planned_exercise_ids, estimated_kcal, client_id
  )
  values (
    caller_id, source_id, source_id, source.name, source.type, started, device_day,
    finished,
    (log ->> 'plannedExercises')::smallint, (log ->> 'plannedSets')::smallint,
    (
      select array_agg(e.value ->> 'exerciseId' order by e.ordinality)
      from jsonb_array_elements(log -> 'exercises') with ordinality e
    ),
    round(
      public.my_strength_kcal_per_minute() * extract(epoch from finished - started) / 60
    )::integer,
    log_client_id
  )
  on conflict (user_id, client_id) where client_id is not null do nothing
  returning id, workout_logs.started_on into new_log_id, log_day;

  if new_log_id is null then
    select l.id into new_log_id
    from public.workout_logs l
    where l.user_id = caller_id and l.client_id = log_client_id;
    return new_log_id;
  end if;

  -- Exercises without sets leave gaps in the positions, which keep the workout's order.
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters
  )
  select new_log_id, caller_id, exercise_position, set_position, exercise_id, weight_kg, reps,
    seconds, meters
  from public.sets_of(log);

  -- The move's target is the day the workout started. A move back to the workout's own day undoes
  -- the move from that day.
  if move_to is not null and abs(move_to - log_day) <= 1 then
    if move_from = move_to then
      delete from public.workout_moves m where m.workout_id = source.id and m.from_on = move_from;
    else
      perform public.save_move(source, move_from, move_to, log_day);
    end if;
  end if;

  return new_log_id;
end;
$$;
