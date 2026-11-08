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
  -- Calories estimated from the average heart rate, the user's age, sex and weight on Keytel's
  -- formula, kept with every read; the summary shows them when the watch measured no calories.
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
create function public.done_at_within(done_at timestamptz, started timestamptz, finished timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when done_at_within.done_at between done_at_within.started - interval '5 minutes'
      and done_at_within.finished + interval '5 minutes'
    then done_at_within.done_at
  end;
$$;

revoke execute on function public.done_at_within(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

-- A user's weight on a day, today without one: the latest on or before it, else the first after
-- it; none without any. Each estimate of a workout's calories takes the weight on its day.
create function public.weight_on(user_id uuid, day date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select e.weight_kg
      from public.weight_entries e
      where e.user_id = weight_on.user_id
        and e.measured_on <= coalesce(weight_on.day, current_date)
      order by e.measured_on desc
      limit 1
    ),
    (
      select e.weight_kg
      from public.weight_entries e
      where e.user_id = weight_on.user_id
        and e.measured_on > coalesce(weight_on.day, current_date)
      order by e.measured_on
      limit 1
    )
  );
$$;

-- The 5 MET estimate of planned workouts, as before, with today's weight as weight_on() gives it.
create or replace function public.my_strength_kcal_per_minute()
returns numeric
language sql
stable
set search_path = ''
as $$
  select public.strength_kcal_per_minute(public.weight_on((select auth.uid()), current_date));
$$;

-- The key a set's time is kept by during an edit: its exercise, the exercise's place and its own.
create function public.set_key(exercise_position smallint, exercise_id text, set_position smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select exercise_position || ':' || exercise_id || ':' || set_position;
$$;

revoke execute on function public.set_key(smallint, text, smallint) from public, anon, authenticated;

-- It runs with the caller's rights, so row level security gives a user only their own weights;
-- my_strength_kcal_per_minute() calls it as the user.
revoke execute on function public.weight_on(uuid, date) from public, anon;
grant execute on function public.weight_on(uuid, date) to authenticated;

-- A heart rate as it is kept, rounded, or none when no person can have it.
create function public.heart_rate_or_none(heart_rate numeric)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case when round(heart_rate) between 25 and 250 then round(heart_rate)::smallint end;
$$;

revoke execute on function public.heart_rate_or_none(numeric) from public, anon, authenticated;

-- A workout's heart rate samples as they are kept: each a heart rate or none, one every 10 seconds
-- from the start, no more than the workout has and 4320 at most; none when too many or none is a
-- heart rate.
create function public.heart_rate_samples_of(
  samples numeric[],
  started timestamptz,
  finished timestamptz
)
returns smallint[]
language sql
immutable
set search_path = ''
as $$
  select case
    when exists (select from unnest(kept) as k(sample) where sample is not null) then kept
  end
  from (
    select (
      select array_agg(public.heart_rate_or_none(sample) order by place)
      from unnest(samples) with ordinality as s(sample, place)
    ) as kept
    where cardinality(samples)
      <= least(4320, ceil(extract(epoch from finished - started) / 10) + 1)
  ) c;
$$;

revoke execute on function public.heart_rate_samples_of(numeric[], timestamptz, timestamptz)
  from public, anon, authenticated;

-- Unchanged apart from keeping when each set was done, and taking the weight on the workout's day
-- for its estimate, as the estimate from the heart rate does.
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
      public.strength_kcal_per_minute(
        public.weight_on(caller_id, coalesce(device_day, (started at time zone 'UTC')::date))
      )
        * extract(epoch from finished - started) / 60
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
    s.reps, s.seconds, s.meters, public.done_at_within(s.done_at, started, finished)
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

-- Unchanged apart from keeping when each set was done: as the edit sends it, or, for an app that
-- sends no times, as the set at the same place of the same exercise had it.
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
  -- When each set was done before the edit, by its exercise, the exercise's place and its own.
  kept jsonb;
  sends_times boolean := jsonb_path_exists(log, '$.exercises[*].sets[*].doneAt');
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

  select jsonb_object_agg(
      public.set_key(s.exercise_position, s.exercise_id, s.set_position), s.done_at
    ) into kept
  from public.logged_sets s
  where s.log_id = edit_workout_log.log_id and s.done_at is not null;

  delete from public.logged_sets s where s.log_id = edit_workout_log.log_id;
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters,
    done_at
  )
  select edit_workout_log.log_id, caller_id, s.exercise_position, s.set_position, s.exercise_id,
    s.weight_kg, s.reps, s.seconds, s.meters,
    public.done_at_within(
      case
        when sends_times then s.done_at
        else (kept ->> public.set_key(s.exercise_position, s.exercise_id, s.set_position))
          ::timestamptz
      end,
      started,
      finished
    )
  from public.sets_of(log) s;
end;
$$;

-- The calories a workout burns by Keytel et al. (2005), from its average heart rate, its minutes and
-- the user's weight, age and sex, in kcal; for a sex not given, the mean of the two formulas. Like
-- the estimate a log is saved with (ADR 0021), it counts all the calories burned, not only those
-- above resting. None below the 90 beats a minute the formula was fitted from, or below 1 MET for
-- the minutes, as resting burns at least that: the 5 MET estimate is shown then.
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
  select case
    when heart_rate >= 90 and estimate >= minutes * weight_kg / 60
    then least(5000, round(estimate))::integer
  end
  from (
    select minutes * case sex
        when 'male' then male
        when 'female' then female
        else (male + female) / 2
      end as estimate
    from per_minute
  ) e;
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
  highest smallint := public.heart_rate_or_none(set_workout_health.heart_rate_max);
  average smallint := public.heart_rate_or_none(set_workout_health.heart_rate_avg);
  -- A value too large for its column is none.
  kcal integer := case
    when round(set_workout_health.active_kcal) between 0 and 5000
    then round(set_workout_health.active_kcal)
  end;
  named text := public.health_source_name(set_workout_health.source);
  log public.workout_logs;
  samples smallint[];
  estimate integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
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
  -- An average above the highest is the highest.
  average := least(average, highest);

  samples := public.heart_rate_samples_of(
    set_workout_health.heart_rate_samples, log.started_at, log.finished_at
  );
  select public.heart_rate_kcal(
      average,
      extract(epoch from log.finished_at - log.started_at) / 60,
      public.weight_on(caller_id, log.started_on),
      -- The age on the workout's day; age_in_years() gives today's.
      extract(year from log.started_on) - p.birth_year,
      p.sex
    )
    into estimate
  from public.profiles p
  where p.user_id = caller_id;

  update public.workout_logs l
  set heart_rate_avg = average,
    heart_rate_max = highest,
    active_kcal = coalesce(kcal, l.active_kcal),
    health_source = coalesce(named, l.health_source),
    heart_rate_samples = coalesce(samples, l.heart_rate_samples),
    heart_rate_kcal = estimate
  where l.id = set_workout_health.log_id and l.user_id = caller_id
    and (l.heart_rate_avg, l.heart_rate_max, l.active_kcal, l.health_source, l.heart_rate_samples,
      l.heart_rate_kcal)
      is distinct from (average, highest, coalesce(kcal, l.active_kcal),
        coalesce(named, l.health_source), coalesce(samples, l.heart_rate_samples), estimate);
  return found;
end;
$$;

revoke execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text, numeric[])
  from public, anon;
grant execute on function public.set_workout_health(bigint, numeric, numeric, numeric, text, numeric[])
  to authenticated;

-- Unchanged apart from which calories to show and where they come from, so that the app and Bite
-- choose alike. The samples are read with the log
-- itself, as a summary has no use for them.
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
  -- The calories to show: the watch's, else those from the heart rate, else those from the minutes.
  coalesce(l.active_kcal, l.heart_rate_kcal, l.estimated_kcal) as kcal,
  case
    when l.active_kcal is not null then 'watch'
    when l.heart_rate_kcal is not null then 'heart_rate'
    when l.estimated_kcal is not null then 'minutes'
  end as kcal_source
from public.workout_logs l
cross join lateral (
  select
    count(distinct t.exercise_position)::integer as exercises,
    count(*)::integer as sets,
    coalesce(sum(t.weight_kg * t.reps), 0)::numeric as kilograms
  from public.logged_sets t
  where t.log_id = l.id
) s;

-- Logs kept with a heart rate before this get its estimate, as a new one does.
update public.workout_logs l
set heart_rate_kcal = public.heart_rate_kcal(
    l.heart_rate_avg,
    extract(epoch from l.finished_at - l.started_at) / 60,
    public.weight_on(l.user_id, l.started_on),
    extract(year from l.started_on) - p.birth_year,
    p.sex
  )
from public.profiles p
where p.user_id = l.user_id and l.heart_rate_avg is not null;
