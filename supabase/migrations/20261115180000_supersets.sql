-- Supersets: two or more exercises next to each other in a workout, done in rounds of one set of
-- each with no rest between them, and the superset's one rest after each round (#141, ADR 0137).
-- A workout's exercises and a log's sets carry the number of their superset. Changes save_workout()
-- of 20261105120000_archive_with_premium.sql, insert_workout_exercises() of
-- 20261026090000_share_workout_exercise_insert.sql, saved_workout() of
-- 20261030230000_coach_proposals.sql, check_sets() of 20261023200000_edit_workout_logs.sql,
-- log_workout() and edit_workout_log() of 20261109100000_workout_heart_rate_samples.sql,
-- edited_workout_exercises() of 20261102140100_coach_alternative_proposals.sql and workout_minutes()
-- of 20261031160000_empty_alternatives.sql.

-- The superset an exercise is in, by a number that joins the exercises of one superset; none for an
-- exercise on its own. Sets keep the superset their exercise was in when the workout was done.
alter table public.workout_exercises
  add column superset smallint check (superset > 0);
alter table public.logged_sets
  add column superset smallint check (superset > 0);

-- The exercises `exercises` with their supersets as a workout or a log may have them: a superset is
-- a whole number from 1 and joins two or more exercises next to each other. In a workout
-- (`with_rest`) they also share one rest, the rest after each round.
create function public.check_supersets(exercises jsonb, with_rest boolean)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_array_elements(exercises) e
    where jsonb_typeof(e -> 'superset') not in ('number', 'null')
      or (jsonb_typeof(e -> 'superset') = 'number' and (e ->> 'superset') !~ '^[1-9][0-9]{0,3}$')
  ) or exists (
    select 1
    from jsonb_array_elements(exercises) with ordinality e
    where jsonb_typeof(e.value -> 'superset') = 'number'
    group by e.value ->> 'superset'
    having count(*) < 2
      or max(e.ordinality) - min(e.ordinality) + 1 <> count(*)
      or (with_rest and count(distinct e.value -> 'restSeconds') > 1)
  ) then
    raise exception 'A superset joins two or more exercises next to each other, with one rest'
      using errcode = 'BB057';
  end if;
end;
$$;

-- The superset of the exercise at `position` in a log, as check_supersets() let it through.
create function public.superset_of(log jsonb, exercise_position smallint)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (log -> 'exercises' -> exercise_position::integer ->> 'superset')::smallint;
$$;

-- Called only from functions that run as their owner (20261024130000_tighten_grants.sql).
revoke execute on function public.check_supersets(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke execute on function public.superset_of(jsonb, smallint)
  from public, anon, authenticated, service_role;

-- The minutes a workout takes, as before, but a superset rests once per round: its exercises count
-- without their rest, and the superset's rest counts once between each of its rounds, as many as
-- the sets of its exercise with the most.
create or replace function public.workout_minutes(items jsonb)
returns smallint
language sql
immutable
set search_path = ''
as $$
  with item as (
    select e as value, (e ->> 'superset')::smallint as superset
    from jsonb_array_elements(items) e
  )
  select least(180, ceil((
    300
    + coalesce((
      select sum(public.exercise_seconds(
        case when i.superset is null then i.value
          else i.value || '{"restSeconds": 0}'::jsonb end
      ))
      from item i
    ), 0)
    + coalesce((
      select sum(g.rest)
      from (
        select (max((i.value ->> 'sets')::integer) - 1) * max((i.value ->> 'restSeconds')::integer)
          as rest
        from item i
        where i.superset is not null
        group by i.superset
      ) g
    ), 0)
  ) / 60.0))::smallint;
$$;

-- As before (20261105120000), and refuses a superset that is not one (BB057).
create or replace function public.save_workout(workout jsonb, today date)
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

  perform public.lock_user_limits(caller_id);
  -- The days before the device's today keep the plan they had (ADR 0041), after the workout's row
  -- is locked, as in set_workout_active().
  if saved_id is not null then
    perform 1 from public.workouts w where w.id = saved_id and w.user_id = caller_id for update;
  end if;
  perform public.keep_planned_days(save_workout.today);

  select l.exercises, l.workouts into max_exercises, max_workouts from public.workout_limits() l;

  if jsonb_array_length(items) not between 1 and max_exercises then
    raise exception 'A workout needs 1 to % exercises', max_exercises using errcode = 'BB008';
  end if;
  -- Workouts from the plan builder count too, as the plan counts them.
  if saved_id is null
    and public.counted_workouts(caller_id) >= max_workouts then
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
  perform public.check_supersets(items, true);

  minutes := public.workout_minutes(items);

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

  -- A slot belongs to a plan's exercises only, so one sent with a hand-made workout is dropped.
  perform public.insert_workout_exercises(
    saved_id,
    caller_id,
    (
      select coalesce(jsonb_agg(e.value - 'slot' order by e.ordinality), '[]'::jsonb)
      from jsonb_array_elements(items) with ordinality e
    )
  );

  return saved_id;
end;
$$;

-- As before (20261026090000), with the superset.
create or replace function public.insert_workout_exercises(workout_id bigint, user_id uuid, items jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.workout_exercises (
    workout_id, user_id, position, exercise_id, slot, sets, target_reps_min, target_reps_max,
    target_seconds, target_meters, rest_seconds, superset
  )
  select
    insert_workout_exercises.workout_id,
    insert_workout_exercises.user_id,
    (e.ordinality - 1)::smallint,
    e.value ->> 'exerciseId',
    (e.value ->> 'slot')::public.plan_slot,
    (e.value ->> 'sets')::smallint,
    (e.value #>> '{target,reps,min}')::smallint,
    (e.value #>> '{target,reps,max}')::smallint,
    (e.value #>> '{target,seconds}')::smallint,
    (e.value #>> '{target,meters}')::integer,
    (e.value ->> 'restSeconds')::smallint,
    (e.value ->> 'superset')::smallint
  from jsonb_array_elements(items) with ordinality e;
$$;

-- As before (20261030230000), with the superset.
create or replace function public.saved_workout(workout_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'weekdays', to_jsonb(w.weekdays),
    'exercises', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'exerciseId', e.exercise_id,
          'sets', e.sets,
          'restSeconds', e.rest_seconds,
          'superset', e.superset,
          'target', jsonb_strip_nulls(jsonb_build_object(
            'reps', case when e.target_reps_min is not null then jsonb_build_object(
              'min', e.target_reps_min, 'max', e.target_reps_max
            ) end,
            'seconds', e.target_seconds,
            'meters', e.target_meters
          ))
        ))
        order by e.position
      )
      from public.workout_exercises e
      where e.workout_id = w.id
    ), '[]'::jsonb)
  )
  from public.workouts w
  where w.id = saved_workout.workout_id and w.user_id = (select auth.uid());
$$;

-- As before (20261023200000), and checks the supersets of the log's exercises.
create or replace function public.check_sets(log jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  set_count integer;
  unsuited boolean;
begin
  select count(*),
    coalesce(
      bool_or(not public.set_suits(x.metrics, s.weight_kg, s.reps, s.seconds, s.meters)), false
    )
  into set_count, unsuited
  from public.sets_of(log) s
  left join public.exercises x on x.id = s.exercise_id;

  if set_count = 0 then
    raise exception 'A log needs at least one set' using errcode = 'BB010';
  end if;
  if unsuited then
    raise exception 'A set does not suit its exercise' using errcode = 'BB011';
  end if;
  perform public.check_supersets(coalesce(log -> 'exercises', '[]'), false);
end;
$$;

-- As before (20261109100000), and keeps each set's superset.
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

  -- An app from before that sends no day either: the start's day in UTC, as the log is kept with.
  device_day := coalesce(device_day, (started at time zone 'UTC')::date);

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
        public.weight_on(caller_id, device_day)
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
    done_at, superset
  )
  select new_log_id, caller_id, s.exercise_position, s.set_position, s.exercise_id, s.weight_kg,
    s.reps, s.seconds, s.meters, public.done_at_within(s.done_at, started, finished),
    public.superset_of(log, s.exercise_position)
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

-- As before (20261109100000), and keeps each set's superset.
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

  -- Without times sent, a set keeps the time of the set at its place, but only in an exercise
  -- whose sets were not added or removed: otherwise the times would move one set over.
  with old as (
    delete from public.logged_sets s
    where s.log_id = edit_workout_log.log_id
    returning s.exercise_position, s.exercise_id, s.set_position, s.done_at
  ), new as (
    select n.*, count(*) over (partition by n.exercise_position, n.exercise_id) as sets
    from public.sets_of(log) n
  ), old_counts as (
    select o.exercise_position, o.exercise_id, count(*) as sets
    from old o
    group by o.exercise_position, o.exercise_id
  )
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters,
    done_at, superset
  )
  select edit_workout_log.log_id, caller_id, n.exercise_position, n.set_position, n.exercise_id,
    n.weight_kg, n.reps, n.seconds, n.meters,
    public.done_at_within(
      case
        when sends_times then n.done_at
        when c.sets = n.sets then o.done_at
      end,
      started,
      finished
    ),
    public.superset_of(log, n.exercise_position)
  from new n
  left join old_counts c using (exercise_position, exercise_id)
  left join old o using (exercise_position, exercise_id, set_position);
end;
$$;

-- As before (20261102140100), and splits up a superset that a removal leaves with one exercise.
create or replace function public.edited_workout_exercises(workout jsonb, edit jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  swaps jsonb := coalesce(edit -> 'swaps', '[]');
  removals jsonb := coalesce(edit -> 'remove', '[]');
  removed text[];
  added jsonb := coalesce(edit -> 'add', '[]');
  present text[];
  replaced text[];
  touched text[];
  incoming text[];
  result jsonb;
begin
  if jsonb_typeof(swaps) <> 'array' or jsonb_typeof(added) <> 'array'
    or jsonb_typeof(removals) <> 'array' then
    raise exception 'Swaps, removals and additions are lists' using errcode = '22023';
  end if;
  if exists (
      select 1 from jsonb_array_elements(swaps) s
      where jsonb_typeof(s -> 'replace') is distinct from 'string'
        or jsonb_typeof(s -> 'with') is distinct from 'string'
    )
    or exists (
      select 1 from jsonb_array_elements(removals) r
      where jsonb_typeof(r) <> 'string'
    )
    or exists (
      select 1 from jsonb_array_elements(added) a
      where jsonb_typeof(a -> 'exerciseId') is distinct from 'string'
    ) then
    raise exception 'An edit names each exercise it changes' using errcode = '22023';
  end if;
  removed := array(select jsonb_array_elements_text(removals));
  if jsonb_array_length(swaps) + cardinality(removed) + jsonb_array_length(added) = 0 then
    raise exception 'An edit changes something' using errcode = '22023';
  end if;

  present := array(select e ->> 'exerciseId' from jsonb_array_elements(workout -> 'exercises') e);
  replaced := array(select s ->> 'replace' from jsonb_array_elements(swaps) s);
  touched := replaced || removed;
  incoming := array(select s ->> 'with' from jsonb_array_elements(swaps) s)
    || array(select a ->> 'exerciseId' from jsonb_array_elements(added) a);
  if not touched <@ present then
    raise exception 'An exercise to replace or remove is not in the workout' using errcode = 'BB039';
  end if;
  if cardinality(touched) <> (select count(distinct t) from unnest(touched) t)
    or cardinality(incoming) <> (select count(distinct i) from unnest(incoming) i)
    or exists (
      select 1 from unnest(present) p where p = any (touched) group by p having count(*) > 1
    )
    -- What comes in is not in the workout as it stays, nor one taken out.
    or exists (select 1 from unnest(incoming) i where i = any (present)) then
    raise exception 'Changes overlap' using errcode = 'BB040';
  end if;

  result := coalesce((
    -- The workout's own first, in their order, then the added ones in theirs.
    select jsonb_agg(item order by part, position)
    from (
      select
        case when swap.value is null then e.value
          else e.value || jsonb_build_object(
            'exerciseId', swap.value ->> 'with',
            'sets', swap.value -> 'sets',
            'target', swap.value -> 'target'
          )
        end as item,
        0 as part,
        e.ordinality as position
      from jsonb_array_elements(workout -> 'exercises') with ordinality e
      left join lateral (
        select s.value from jsonb_array_elements(swaps) s
        where s.value ->> 'replace' = e.value ->> 'exerciseId'
      ) swap on true
      where not (e.value ->> 'exerciseId' = any (removed))
      union all
      select
        jsonb_build_object(
          'exerciseId', a.value ->> 'exerciseId',
          'sets', a.value -> 'sets',
          'restSeconds', 90,
          'target', a.value -> 'target'
        ),
        1,
        a.ordinality
      from jsonb_array_elements(added) with ordinality a
    ) items
  ), '[]'::jsonb);

  -- An exercise swapped keeps its place in its superset, and one added joins none. A superset left
  -- with one exercise by a removal is split up, as one exercise is no superset.
  return coalesce((
    select jsonb_agg(
      case when i.members < 2 then i.value - 'superset' else i.value end
      order by i.ordinality
    )
    from (
      select e.value, e.ordinality,
        count(*) over (partition by e.value -> 'superset') as members
      from jsonb_array_elements(result) with ordinality e
    ) i
  ), '[]'::jsonb);
end;
$$;
