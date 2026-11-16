-- The heaviest record needs an exercise of reps (#630), as the app counts it (recordValues()): a
-- weighted hold or a carry logged with a weight no longer gets one, which the app never showed.
-- Replaces record_candidates() of 20261029190000_record_history.sql, keeping its grants.
create or replace function public.record_candidates(exercise_id text)
returns table (
  kind text,
  value numeric,
  lower_is_better boolean,
  log_id bigint,
  started_at timestamptz,
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer,
  exercise_position smallint,
  set_position smallint
)
language sql
stable
set search_path = ''
as $$
  with recorded as (
    select x.metrics from public.exercises x where x.id = record_candidates.exercise_id
  ),
  sets as (
    select s.log_id, l.started_at, s.weight_kg, s.reps::integer as reps, s.seconds, s.meters,
      s.exercise_position, s.set_position
    from public.logged_sets s
    join public.workout_logs l on l.id = s.log_id
    where s.exercise_id = record_candidates.exercise_id
  )
  select 'heaviest', s.weight_kg, false, s.*
  from sets s, recorded r
  -- Only an exercise of reps, as the app counts it: a weight held or carried is no lift.
  where s.weight_kg > 0 and 'reps' = any(r.metrics)
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
    sum(s.seconds)::integer, null, null, null
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
    and 'distance' = any(r.metrics) and 'duration' = any(r.metrics);
$$;
