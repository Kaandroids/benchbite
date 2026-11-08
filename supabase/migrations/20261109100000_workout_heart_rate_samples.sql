-- A workout's heart rate over its time, and when each set was done (#480, ADR 0104): the chart of a
-- logged workout, with its sets marked on it; and calories estimated from the heart rate when the
-- watch measured none.

-- When a set was done, as the phone's clock had it; none for a set from before, or added later.
alter table public.logged_sets add column done_at timestamptz;

alter table public.workout_logs
  -- The heart rate every 10 seconds from the start, in beats a minute; none where nothing measured
  -- it. 12 hours at most, as a workout.
  add column heart_rate_samples smallint[]
    check (cardinality(heart_rate_samples) between 1 and 4320),
  -- Calories estimated from the average heart rate, for a workout the watch measured no calories
  -- of: the user's age, sex and weight on Keytel's formula.
  add column heart_rate_kcal integer check (heart_rate_kcal between 0 and 5000);

-- The sets of a log, as before, with when each was done.
drop function public.sets_of(jsonb);
create function public.sets_of(log jsonb)
returns table (
  exercise_position smallint,
  set_position smallint,
  exercise_id text,
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer,
  done_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    (e.ordinality - 1)::smallint,
    (s.ordinality - 1)::smallint,
    e.value ->> 'exerciseId',
    (s.value ->> 'weightKg')::numeric,
    (s.value ->> 'reps')::integer,
    (s.value ->> 'seconds')::integer,
    (s.value ->> 'meters')::integer,
    case
      when jsonb_typeof(s.value -> 'doneAt') = 'string'
        and pg_input_is_valid(s.value ->> 'doneAt', 'timestamptz')
      then (s.value ->> 'doneAt')::timestamptz
    end
  from jsonb_array_elements(coalesce(log -> 'exercises', '[]')) with ordinality e,
    jsonb_array_elements(coalesce(e.value -> 'sets', '[]')) with ordinality s;
$$;

revoke execute on function public.sets_of(jsonb) from public, anon, authenticated;

-- When a set was done, if it falls within its workout; a phone's clock may be five minutes off.
create function public.set_done_at(done_at timestamptz, started timestamptz, finished timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when set_done_at.done_at between set_done_at.started - interval '5 minutes'
      and set_done_at.finished + interval '5 minutes'
    then set_done_at.done_at
  end;
$$;

revoke execute on function public.set_done_at(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Unchanged apart from keeping when each set was done.
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

  -- As for the end, a phone's clock may be up to five minutes ahead.
  if source.held and started > source.held_at + interval '5 minutes' then
    raise exception 'The workout waits for premium' using errcode = 'BB051';
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
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters,
    done_at
  )
  select new_log_id, caller_id, s.exercise_position, s.set_position, s.exercise_id, s.weight_kg,
    s.reps, s.seconds, s.meters, public.set_done_at(s.done_at, started, finished)
  from public.sets_of(log) s;

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

-- Unchanged apart from keeping when each set was done: as the edit sends it, or as the set at the
-- same place of the same exercise had it, for an app that sends none.
create or replace function public.edit_workout_log(log_id bigint, log jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  started timestamptz;
  finished timestamptz;
  -- When each set was done before the edit, by its exercise and place.
  kept jsonb;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select l.started_at, l.finished_at into started, finished
  from public.workout_logs l
  where l.id = edit_workout_log.log_id and l.user_id = caller_id;
  if not found then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;

  perform public.check_sets(log);

  select jsonb_object_agg(s.exercise_id || ':' || s.set_position, s.done_at) into kept
  from public.logged_sets s
  where s.log_id = edit_workout_log.log_id and s.done_at is not null;

  delete from public.logged_sets s where s.log_id = edit_workout_log.log_id;
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters,
    done_at
  )
  select edit_workout_log.log_id, caller_id, s.exercise_position, s.set_position, s.exercise_id,
    s.weight_kg, s.reps, s.seconds, s.meters,
    public.set_done_at(
      coalesce(s.done_at, (kept ->> (s.exercise_id || ':' || s.set_position))::timestamptz),
      started,
      finished
    )
  from public.sets_of(log) s;
end;
$$;

-- The calories a workout burns by Keytel et al. (2005), from its average heart rate, its minutes and
-- the user's weight, age and sex, in kcal; for a sex not given, the mean of the two formulas. Like
-- the estimate a log is saved with (ADR 0021), it counts all the calories burned, not only those
-- above resting.
create function public.heart_rate_kcal(
  heart_rate numeric,
  minutes numeric,
  weight_kg numeric,
  age numeric,
  sex public.sex
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with per_minute as (
    select
      (-55.0969 + 0.6309 * heart_rate + 0.1988 * weight_kg + 0.2017 * age) / 4.184 as male,
      (-20.4022 + 0.4472 * heart_rate - 0.1263 * weight_kg + 0.074 * age) / 4.184 as female
  )
  select least(5000, greatest(0, round(minutes * case sex
      when 'male' then male
      when 'female' then female
      else (male + female) / 2
    end)))::integer
  from per_minute;
$$;

revoke execute on function public.heart_rate_kcal(numeric, numeric, numeric, numeric, public.sex)
  from public, anon, authenticated;

-- Keeps what the phone's health store measured for one of the caller's workouts, as before (ADR
-- 0099), with its heart rate every 10 seconds from the start: a value no person can have is none,
-- and samples running past the workout's end are left out. With a heart rate, the calories it gives are
-- estimated too, for when the watch measured none. Whether the log changed.
drop function public.set_workout_health(bigint, numeric, numeric, numeric, text);
create function public.set_workout_health(
  log_id bigint,
  heart_rate_avg numeric default null,
  heart_rate_max numeric default null,
  active_kcal numeric default null,
  source text default null,
  heart_rate_samples numeric[] default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  average smallint;
  highest smallint;
  kcal integer;
  named text := public.health_source_name(set_workout_health.source);
  log public.workout_logs;
  samples smallint[];
  estimate integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- A value no person can have is none, also one too large for its column.
  if set_workout_health.heart_rate_avg between 25 and 250 then
    average := round(set_workout_health.heart_rate_avg);
  end if;
  if set_workout_health.heart_rate_max between 25 and 250 then
    highest := round(set_workout_health.heart_rate_max);
  end if;
  if set_workout_health.active_kcal between 0 and 5000 then
    kcal := round(set_workout_health.active_kcal);
  end if;

  select * into log
  from public.workout_logs l
  where l.id = set_workout_health.log_id and l.user_id = caller_id;
  if not found then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;
  if average is null or highest is null then
    return false;
  end if;

  -- One sample every 10 seconds, no more than the workout has; none when none is a heart rate.
  if cardinality(set_workout_health.heart_rate_samples)
    <= ceil(extract(epoch from log.finished_at - log.started_at) / 10) + 1 then
    select array_agg(
        case when sample between 25 and 250 then round(sample)::smallint end order by place
      )
      into samples
    from unnest(set_workout_health.heart_rate_samples) with ordinality as s(sample, place);
    if not exists (select from unnest(samples) as s(sample) where sample is not null) then
      samples := null;
    end if;
  end if;

  -- The weight on the workout's day or before it, else the first after.
  select public.heart_rate_kcal(
      least(average, highest),
      extract(epoch from log.finished_at - log.started_at) / 60,
      w.weight_kg,
      extract(year from log.started_on) - p.birth_year,
      p.sex
    )
    into estimate
  from public.profiles p
  cross join lateral (
    select e.weight_kg
    from public.weight_entries e
    where e.user_id = caller_id
    order by e.measured_on > log.started_on, abs(e.measured_on - log.started_on)
    limit 1
  ) w
  where p.user_id = caller_id;

  update public.workout_logs l
  set heart_rate_avg = least(average, highest),
    heart_rate_max = highest,
    active_kcal = coalesce(kcal, l.active_kcal),
    health_source = coalesce(named, l.health_source),
    heart_rate_samples = coalesce(samples, l.heart_rate_samples),
    heart_rate_kcal = estimate
  where l.id = set_workout_health.log_id and l.user_id = caller_id
    and (l.heart_rate_avg, l.heart_rate_max, l.active_kcal, l.health_source, l.heart_rate_samples,
      l.heart_rate_kcal)
      is distinct from (least(average, highest), highest, coalesce(kcal, l.active_kcal),
        coalesce(named, l.health_source), coalesce(samples, l.heart_rate_samples), estimate);
  return found;
end;
$$;

revoke execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text, numeric[])
  from public, anon;
grant execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text, numeric[])
  to authenticated;

-- Unchanged apart from the calories estimated from the heart rate. The samples are read with the
-- log itself, as a summary has no use for them.
create or replace view public.workout_log_summaries
with (security_invoker = true)
as
select
  l.id,
  l.workout_id,
  l.name,
  l.type,
  l.started_at,
  l.finished_at,
  s.exercises,
  l.planned_exercises,
  s.sets,
  l.planned_sets,
  s.kilograms,
  l.estimated_kcal,
  l.planned_exercise_ids,
  l.alternative_name,
  l.alternative_position,
  l.heart_rate_avg,
  l.heart_rate_max,
  l.active_kcal,
  l.health_source,
  l.heart_rate_kcal
from public.workout_logs l
cross join lateral (
  select
    count(distinct t.exercise_position)::integer as exercises,
    count(*)::integer as sets,
    coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
  from public.logged_sets t
  where t.log_id = l.id
) s;
