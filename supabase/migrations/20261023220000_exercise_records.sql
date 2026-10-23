-- An exercise's progress and records, calculated from the caller's logged sets whenever they are
-- read (#36, #80, ADR 0024). Both functions run with the caller's rights, so they only see the
-- caller's logs.

-- The weight that could be lifted once, estimated from a set with Epley's formula; a single rep is
-- its own one-rep max.
create function public.one_rep_max(weight_kg numeric, reps integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when weight_kg is null or weight_kg <= 0 or reps is null then null
    when reps = 1 then weight_kg
    else round(weight_kg * (1 + reps / 30.0), 1)
  end;
$$;

-- What an exercise came to in each finished workout it was done in, oldest first, for the chart
-- of its progress. Values the exercise does not record are null.
create function public.exercise_progress(exercise_id text)
returns table (
  log_id bigint,
  started_at timestamptz,
  heaviest_kg numeric,
  one_rep_max_kg numeric,
  volume_kg numeric,
  most_reps integer,
  total_reps integer,
  longest_seconds integer,
  total_seconds integer,
  longest_meters integer,
  -- Seconds per kilometre; lower is faster.
  best_pace numeric
)
language sql
stable
set search_path = ''
as $$
  select
    s.log_id,
    l.started_at,
    max(s.weight_kg) filter (where s.weight_kg > 0),
    max(public.one_rep_max(s.weight_kg, s.reps)),
    sum(s.weight_kg * s.reps) filter (where s.weight_kg > 0),
    max(s.reps)::integer,
    sum(s.reps)::integer,
    max(s.seconds),
    sum(s.seconds)::integer,
    max(s.meters),
    round(min(s.seconds * 1000.0 / s.meters), 1)
  from public.logged_sets s
  join public.workout_logs l on l.id = s.log_id
  where s.exercise_id = exercise_progress.exercise_id
  group by s.log_id, l.started_at
  order by l.started_at, s.log_id;
$$;

-- The caller's records of an exercise, one row for each kind it has one of. The kinds follow what
-- the exercise records:
--   heaviest          weight, or reps (added weight)   the heaviest set
--   one_rep_max       weight and reps                  the best estimated one-rep max
--   best_set          weight and reps                  the most weight × reps in one set
--   most_reps         reps                             the most reps in one set
--   longest_time      duration, without distance       the longest set
--   most_time         duration, without distance       the most time in one workout
--   longest_distance  distance                         the longest set
--   best_pace         distance and duration            the fastest set, in seconds per km
-- Each record is the first time its best value was reached, with the set that reached it (the
-- workout's total for most_time).
create function public.exercise_records(exercise_id text)
returns table (
  kind text,
  value numeric,
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer,
  log_id bigint,
  achieved_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with recorded as (
    select x.metrics from public.exercises x where x.id = exercise_records.exercise_id
  ),
  sets as (
    select s.log_id, l.started_at, s.weight_kg, s.reps::integer as reps, s.seconds, s.meters
    from public.logged_sets s
    join public.workout_logs l on l.id = s.log_id
    where s.exercise_id = exercise_records.exercise_id
  ),
  candidates as (
    select 'heaviest' as kind, s.weight_kg as value, false as lower_is_better, s.*
    from sets s, recorded r
    where s.weight_kg > 0 and ('weight' = any(r.metrics) or 'reps' = any(r.metrics))
    union all
    select 'one_rep_max', public.one_rep_max(s.weight_kg, s.reps), false, s.*
    from sets s, recorded r
    where s.weight_kg > 0 and s.reps is not null
      and 'weight' = any(r.metrics) and 'reps' = any(r.metrics)
    union all
    select 'best_set', s.weight_kg * s.reps, false, s.*
    from sets s, recorded r
    where s.weight_kg > 0 and s.reps is not null
      and 'weight' = any(r.metrics) and 'reps' = any(r.metrics)
    union all
    select 'most_reps', s.reps, false, s.*
    from sets s, recorded r
    where s.reps is not null and 'reps' = any(r.metrics)
    union all
    select 'longest_time', s.seconds, false, s.*
    from sets s, recorded r
    where s.seconds is not null
      and 'duration' = any(r.metrics) and not 'distance' = any(r.metrics)
    union all
    select 'most_time', sum(s.seconds), false, s.log_id, min(s.started_at), null, null,
      sum(s.seconds)::integer, null
    from sets s, recorded r
    where s.seconds is not null
      and 'duration' = any(r.metrics) and not 'distance' = any(r.metrics)
    group by s.log_id
    union all
    select 'longest_distance', s.meters, false, s.*
    from sets s, recorded r
    where s.meters is not null and 'distance' = any(r.metrics)
    union all
    select 'best_pace', round(s.seconds * 1000.0 / s.meters, 1), true, s.*
    from sets s, recorded r
    where s.seconds is not null and s.meters is not null
      and 'distance' = any(r.metrics) and 'duration' = any(r.metrics)
  )
  select distinct on (c.kind)
    c.kind, c.value, c.weight_kg, c.reps, c.seconds, c.meters, c.log_id, c.started_at
  from candidates c
  order by c.kind,
    case when c.lower_is_better then c.value end asc,
    case when not c.lower_is_better then c.value end desc,
    c.started_at, c.log_id;
$$;

revoke execute on function public.exercise_progress, public.exercise_records from public, anon;
grant execute on function public.exercise_progress, public.exercise_records to authenticated;
