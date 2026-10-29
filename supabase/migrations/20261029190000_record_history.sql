-- The Progress tab lists the records beaten across every exercise, the latest first (ADR 0047,
-- #305). What a set comes to for each kind of record moves out of exercise_records() into
-- record_candidates(), so that the records of an exercise and the records beaten over time count
-- the same way (ADR 0024).

-- What each of the caller's sets of an exercise comes to for each kind of record the exercise has,
-- as exercise_records() describes the kinds (20261024090000); most_time is a workout's total.
create function public.record_candidates(exercise_id text)
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

-- Read with the caller's rights, so that Row Level Security keeps each user to their own sets.
revoke execute on function public.record_candidates(text) from public, anon;
grant execute on function public.record_candidates(text) to authenticated;

-- As before (20261024090000), from record_candidates().
create or replace function public.exercise_records(exercise_id text)
returns table (
  kind text,
  value numeric,
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer,
  log_id bigint,
  achieved_at timestamptz,
  exercise_position smallint,
  set_position smallint
)
language sql
stable
set search_path = ''
as $$
  select distinct on (c.kind)
    c.kind, c.value, c.weight_kg, c.reps, c.seconds, c.meters, c.log_id, c.started_at,
    c.exercise_position, c.set_position
  from public.record_candidates(exercise_records.exercise_id) c
  order by c.kind,
    case when c.lower_is_better then c.value end asc,
    case when not c.lower_is_better then c.value end desc,
    c.started_at, c.log_id, c.exercise_position, c.set_position;
$$;

-- Each time one of the caller's workouts beat the best before it of a kind of record of an
-- exercise, the latest first: the record, the best it beat, and the set that beat it. A first
-- value is no record, as nothing was beaten (ADR 0025), and equalling the best is none either
-- (ADR 0024). A workout that beat several kinds of one exercise gives the first of them in the
-- order the app shows the kinds (RECORD_KINDS in src/sets/records.ts; change both together), so
-- that one set is not listed once for each.
create function public.record_history()
returns table (
  exercise_id text,
  kind text,
  value numeric,
  previous numeric,
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer,
  log_id bigint,
  achieved_on date
)
language sql
stable
set search_path = ''
as $$
  with exercises as (
    select distinct s.exercise_id from public.logged_sets s
  ),
  -- The best of each kind in each workout, from its first set that reached it.
  workouts as (
    select distinct on (x.exercise_id, c.kind, c.log_id) x.exercise_id, c.*
    from exercises x
    cross join lateral public.record_candidates(x.exercise_id) c
    order by x.exercise_id, c.kind, c.log_id,
      case when c.lower_is_better then c.value end asc,
      case when not c.lower_is_better then c.value end desc,
      c.exercise_position, c.set_position
  ),
  against as (
    select w.*,
      case
        when w.lower_is_better then min(w.value) over earlier
        else max(w.value) over earlier
      end as previous
    from workouts w
    window earlier as (
      partition by w.exercise_id, w.kind
      order by w.started_at, w.log_id
      rows between unbounded preceding and 1 preceding
    )
  ),
  beaten as (
    select distinct on (a.exercise_id, a.log_id) a.*
    from against a
    where a.previous is not null
      and case when a.lower_is_better then a.value < a.previous else a.value > a.previous end
    order by a.exercise_id, a.log_id,
      array_position(
        array['heaviest', 'one_rep_max', 'best_set', 'most_reps', 'longest_time', 'most_time',
          'longest_distance', 'best_pace'],
        a.kind
      )
  )
  select b.exercise_id, b.kind, b.value, b.previous, b.weight_kg, b.reps, b.seconds, b.meters,
    b.log_id, l.started_on
  from beaten b
  join public.workout_logs l on l.id = b.log_id
  order by b.started_at desc, b.log_id desc, b.exercise_id;
$$;

revoke execute on function public.record_history() from public, anon;
grant execute on function public.record_history() to authenticated;
