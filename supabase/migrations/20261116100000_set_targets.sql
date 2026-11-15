-- Set targets: a weight and reps, or a time, for each set of an exercise in a workout (#180,
-- ADR 0138). The user's own are kept on the workout's exercise; without them, set_targets() works
-- out each set's from the same set last time. Changes insert_workout_exercises(),
-- saved_workout() and edited_workout_exercises() of 20261115180000_supersets.sql.

-- The user's own targets for the exercise's sets, in order; none to have them worked out from
-- last time. Fewer than the sets leave the later sets with the last one's.
alter table public.workout_exercises
  add column set_targets jsonb check (set_targets is null or jsonb_typeof(set_targets) = 'array');

-- The own targets of a workout's exercises `items` as they may be: for an exercise with them, one
-- to as many as its sets, each a set it can log (set_suits()), with a weight, reps and a time in
-- the ranges a logged set has.
create function public.check_set_targets(items jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(items) e
    where jsonb_typeof(e -> 'setTargets') not in ('array', 'null')
      or (jsonb_typeof(e -> 'setTargets') = 'array'
        and jsonb_array_length(e -> 'setTargets') not between 1 and (e ->> 'sets')::integer)
  ) or exists (
    select 1
    from jsonb_array_elements(items) e
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(e -> 'setTargets') = 'array' then e -> 'setTargets' else '[]' end
    ) t
    -- Each value read only once it is a number, so another fails the check, not the cast.
    cross join lateral (
      select
        case when jsonb_typeof(t -> 'weightKg') = 'number' then (t ->> 'weightKg')::numeric end weight_kg,
        case when jsonb_typeof(t -> 'reps') = 'number' then (t ->> 'reps')::numeric end reps,
        case when jsonb_typeof(t -> 'seconds') = 'number' then (t ->> 'seconds')::numeric end seconds
    ) v
    left join public.exercises x on x.id = e ->> 'exerciseId'
    where jsonb_typeof(t) <> 'object'
      or jsonb_typeof(t -> 'weightKg') not in ('number', 'null')
      or jsonb_typeof(t -> 'reps') not in ('number', 'null')
      or jsonb_typeof(t -> 'seconds') not in ('number', 'null')
      or case when jsonb_typeof(t) = 'object' then t - 'weightKg' - 'reps' - 'seconds' <> '{}' end
      or v.weight_kg not between 0 and 999.99
      or v.reps not between 1 and 999
      or v.reps <> trunc(v.reps)
      or v.seconds not between 1 and 86400
      or v.seconds <> trunc(v.seconds)
      or not public.set_suits(x.metrics, v.weight_kg, v.reps::integer, v.seconds::integer, null)
  ) then
    raise exception 'A set target does not suit its exercise' using errcode = 'BB058';
  end if;
end;
$$;

-- Called only from functions that run as their owner (20261024130000_tighten_grants.sql).
revoke execute on function public.check_set_targets(jsonb)
  from public, anon, authenticated, service_role;

-- The weight a target goes up or down by, as the watch's Crown turns it (weightStepOf() in
-- src/sets/fields.ts).
create function public.weight_step(equipment public.equipment)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case equipment when 'dumbbell' then 2 when 'kettlebells' then 4 else 2.5 end;
$$;

-- The set at `set_position` of the exercise in a log, or its last when it had fewer; of its first
-- place when the log has it twice.
create function public.logged_set_at(log_id bigint, exercise_id text, set_position integer)
returns public.logged_sets
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.logged_sets s
  where s.log_id = logged_set_at.log_id and s.exercise_id = logged_set_at.exercise_id
  order by s.exercise_position,
    s.set_position <= logged_set_at.set_position desc,
    case when s.set_position <= logged_set_at.set_position then -s.set_position else s.set_position end
  limit 1;
$$;

-- Called by set_targets() as its caller, whose own logs alone logged_set_at() sees.
revoke execute on function public.weight_step(public.equipment) from public, anon;
grant execute on function public.weight_step(public.equipment) to authenticated;
revoke execute on function public.logged_set_at(bigint, text, integer) from public, anon;
grant execute on function public.logged_set_at(bigint, text, integer) to authenticated;

-- Each set's target of the caller's workout, by its exercise's place and its own (ADR 0138): the
-- user's own where the exercise has them, the set after the last of them taking the last one's;
-- otherwise worked out from the same set when the exercise was last done, the last set where it
-- had fewer:
-- - reps: the top of the rep range reached, a weight step more for the bottom of the range; three
--   times running short of the bottom, a step less for its middle; otherwise the same weight for
--   one rep more, up to the top. Done with the body's weight, one rep more.
-- - a time: its target time reached, 5 seconds more; otherwise the target time. The weight stays.
-- - a distance, or an exercise never done: none, and the set starts from last time as before.
create function public.set_targets(workout_id bigint)
returns table (
  exercise_position smallint,
  set_position smallint,
  weight_kg numeric,
  reps integer,
  seconds integer,
  own boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  exercise record;
  logs bigint[];
  i integer;
  target jsonb;
  previous public.logged_sets;
  low integer;
  high integer;
  step numeric;
  short integer;
begin
  for exercise in
    select e.position, e.exercise_id, e.sets, e.target_reps_min, e.target_reps_max,
      e.target_seconds, e.set_targets, x.metrics, x.equipment
    from public.workout_exercises e
    join public.exercises x on x.id = e.exercise_id
    where e.workout_id = set_targets.workout_id
    order by e.position
  loop
    exercise_position := exercise.position;
    if exercise.set_targets is not null then
      for i in 0 .. exercise.sets - 1 loop
        target := coalesce(exercise.set_targets -> i, exercise.set_targets -> -1);
        set_position := i;
        weight_kg := (target ->> 'weightKg')::numeric;
        reps := (target ->> 'reps')::integer;
        seconds := (target ->> 'seconds')::integer;
        own := true;
        return next;
      end loop;
      continue;
    end if;

    continue when 'distance' = any (exercise.metrics);
    -- The exercise's latest three logs, newest first, as last_sets() finds the latest.
    logs := array(
      select l.id
      from public.workout_logs l
      where exists (
        select 1 from public.logged_sets t
        where t.log_id = l.id and t.exercise_id = exercise.exercise_id
      )
      order by l.finished_at desc, l.id desc
      limit 3
    );
    continue when cardinality(logs) = 0;
    step := public.weight_step(exercise.equipment);

    for i in 0 .. exercise.sets - 1 loop
      previous := public.logged_set_at(logs[1], exercise.exercise_id, i);
      set_position := i;
      own := false;
      weight_kg := previous.weight_kg;
      reps := null;
      seconds := null;
      if 'reps' = any (exercise.metrics) then
        low := coalesce(exercise.target_reps_min, previous.reps);
        high := coalesce(exercise.target_reps_max, low);
        select count(*) into short
        from unnest(logs) l
        where (public.logged_set_at(l, exercise.exercise_id, i)).reps < low;
        if previous.weight_kg is null then
          reps := least(previous.reps + 1, 999);
        elsif previous.reps >= high then
          weight_kg := least(previous.weight_kg + step, 999.99);
          reps := low;
        elsif short = 3 and previous.weight_kg - step >= step then
          weight_kg := previous.weight_kg - step;
          reps := (low + high + 1) / 2;
        else
          reps := least(previous.reps + 1, high);
        end if;
      else
        seconds := case
          when previous.seconds >= exercise.target_seconds then least(previous.seconds + 5, 86400)
          else coalesce(exercise.target_seconds, previous.seconds)
        end;
      end if;
      continue when reps is null and seconds is null;
      return next;
    end loop;
  end loop;
end;
$$;

-- Read by the app as the caller, whose own workouts and logs alone it sees (row level security).
revoke execute on function public.set_targets(bigint) from public, anon;
grant execute on function public.set_targets(bigint) to authenticated;

-- As before (20261115180000), and checks and keeps the own targets.
create or replace function public.insert_workout_exercises(workout_id bigint, user_id uuid, items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.check_supersets(items);
  perform public.check_set_targets(items);

  insert into public.workout_exercises (
    workout_id, user_id, position, exercise_id, slot, sets, target_reps_min, target_reps_max,
    target_seconds, target_meters, rest_seconds, superset, set_targets
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
    (e.value ->> 'superset')::smallint,
    nullif(e.value -> 'setTargets', 'null'::jsonb)
  from jsonb_array_elements(items) with ordinality e;
end;
$$;

-- As before (20261115180000), with the own targets.
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
          'setTargets', e.set_targets,
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

-- As before (20261115180000), and an exercise swapped in has no own set targets: the other's
-- would be of another exercise.
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
          -- One swapped in has none of the other's own set targets.
          else (e.value - 'setTargets') || jsonb_build_object(
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
