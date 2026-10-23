-- Finished workouts with the sets that were done (#34, ADR 0020). A workout in progress lives only
-- in the app; when it is finished, log_workout() saves it with all its sets at once. A log keeps
-- the workout's name and type as they were, so it stays readable after the workout is edited or
-- deleted.
--
-- Errors the app needs to tell apart have their own SQLSTATE codes:
--   BB010  a log needs at least one set
--   BB011  a set does not suit what its exercise records
--   BB012  the start and end of the workout do not make sense

create table public.workout_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Null once the workout is deleted.
  workout_id bigint references public.workouts (id) on delete set null,
  name text check (length(trim(name)) between 1 and 60),
  type public.workout_type,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  check (name is not null or type is not null),
  check (finished_at > started_at and finished_at - started_at <= interval '12 hours')
);

create table public.logged_sets (
  id bigint generated always as identity primary key,
  log_id bigint not null references public.workout_logs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The exercise's place in the workout, and the set's place within the exercise, from 0.
  exercise_position smallint not null check (exercise_position between 0 and 49),
  set_position smallint not null check (set_position between 0 and 19),
  exercise_id text not null references public.exercises (id),
  -- What was done, as far as the exercise records it. The weight of a bodyweight exercise is
  -- weight added to the body.
  weight_kg numeric(5, 2) check (weight_kg between 0 and 999.99),
  reps smallint check (reps between 1 and 999),
  seconds integer check (seconds between 1 and 86400),
  meters integer check (meters between 1 and 1000000),
  check (reps is not null or seconds is not null or meters is not null),
  unique (log_id, exercise_position, set_position)
);

create index workout_logs_user_id_finished_at_idx on public.workout_logs (user_id, finished_at desc);
create index workout_logs_workout_id_idx on public.workout_logs (workout_id);
create index logged_sets_log_id_idx on public.logged_sets (log_id);
create index logged_sets_user_id_exercise_id_idx on public.logged_sets (user_id, exercise_id);

-- Users read and delete their own logs. Logs are written only by log_workout().
alter table public.workout_logs enable row level security;
alter table public.logged_sets enable row level security;

create policy "Users read their own workout logs"
  on public.workout_logs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users delete their own workout logs"
  on public.workout_logs for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their own logged sets"
  on public.logged_sets for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.workout_logs, public.logged_sets from anon, authenticated;
grant select on public.workout_logs, public.logged_sets to authenticated;
grant delete on public.workout_logs to authenticated;

-- Whether a set's values suit an exercise's metrics: reps only where it records reps, a weight
-- where it records weight or reps (added weight), a time where it records a duration, a distance
-- where it records one. What the exercise is measured by must be there: the reps, or else a time
-- or a distance.
create function public.set_suits(
  metrics public.exercise_metric[],
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (reps is null or 'reps' = any(metrics))
    and (weight_kg is null or 'weight' = any(metrics) or 'reps' = any(metrics))
    and (seconds is null or 'duration' = any(metrics))
    and (meters is null or 'distance' = any(metrics))
    and case
      when 'reps' = any(metrics) then reps is not null
      else seconds is not null or meters is not null
    end;
$$;

-- One row per set of a log as log_workout() takes it, with its place in the workout.
create function public.sets_of(log jsonb)
returns table (
  exercise_position smallint,
  set_position smallint,
  exercise_id text,
  weight_kg numeric,
  reps integer,
  seconds integer,
  meters integer
)
language sql
immutable
set search_path = ''
as $$
  select
    (e.ordinality - 1)::smallint,
    (s.ordinality - 1)::smallint,
    e.value ->> 'exerciseId',
    (s.value ->> 'weightKg')::numeric,
    (s.value ->> 'reps')::integer,
    (s.value ->> 'seconds')::integer,
    (s.value ->> 'meters')::integer
  from jsonb_array_elements(coalesce(log -> 'exercises', '[]')) with ordinality e,
    jsonb_array_elements(coalesce(e.value -> 'sets', '[]')) with ordinality s;
$$;

-- Saves a finished workout with its sets and returns the log's id:
--   {"workoutId": 7, "startedAt": "…", "finishedAt": "…",
--    "exercises": [{"exerciseId": "Pushups", "sets": [{"weightKg": null, "reps": 12}]}]}
-- Exercises without sets are left out; a log needs at least one set. Every log starts from one of
-- the caller's workouts, whose name and type are copied into it.
create function public.log_workout(log jsonb)
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
  source public.workouts;
  new_log_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if started is null or finished is null or finished <= started
    or finished - started > interval '12 hours' or finished > now() + interval '5 minutes' then
    raise exception 'The workout''s start and end do not make sense' using errcode = 'BB012';
  end if;

  select * into source from public.workouts w where w.id = source_id and w.user_id = caller_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;

  if not exists (select 1 from public.sets_of(log)) then
    raise exception 'A log needs at least one set' using errcode = 'BB010';
  end if;
  -- Unknown exercises are left to the foreign key.
  if exists (
    select 1 from public.sets_of(log) s join public.exercises x on x.id = s.exercise_id
    where not public.set_suits(x.metrics, s.weight_kg, s.reps, s.seconds, s.meters)
  ) then
    raise exception 'A set does not suit its exercise' using errcode = 'BB011';
  end if;

  insert into public.workout_logs (user_id, workout_id, name, type, started_at, finished_at)
  values (caller_id, source_id, source.name, source.type, started, finished)
  returning id into new_log_id;

  -- Exercises without sets leave gaps in the positions, which keep the workout's order.
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters
  )
  select new_log_id, caller_id, exercise_position, set_position, exercise_id, weight_kg, reps,
    seconds, meters
  from public.sets_of(log);

  return new_log_id;
end;
$$;

revoke execute on function public.log_workout from public, anon;
grant execute on function public.log_workout to authenticated;

-- The sets of the last log of each exercise, for "last time" while logging. Runs with the
-- caller's rights, so it only sees the caller's logs.
create function public.last_sets(exercise_ids text[])
returns setof public.logged_sets
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.logged_sets s
  where s.exercise_id = any(exercise_ids)
    and s.log_id = (
      select l.id
      from public.workout_logs l
      join public.logged_sets t on t.log_id = l.id
      where t.exercise_id = s.exercise_id
      order by l.finished_at desc, l.id desc
      limit 1
    )
  order by s.exercise_id, s.exercise_position, s.set_position;
$$;

revoke execute on function public.last_sets from public, anon;
grant execute on function public.last_sets to authenticated;
