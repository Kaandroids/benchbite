-- set_targets() names each target's exercise beside its place (#617), so that the app uses a target
-- only for the exercise it was worked out for: a workout the app holds can be older than the
-- database's, its exercises in another order. Replaces set_targets() of
-- 20261116100000_set_targets.sql; a function's columns cannot change in place.
drop function public.set_targets(bigint);

-- Each set's target of the caller's workout, by its exercise's place and the exercise, and its own
-- (ADR 0138): the user's own where the exercise has them, the set after the last of them taking the
-- last one's; otherwise worked out from the same set when the exercise was last done, the last set
-- where it had fewer:
-- - reps: the top of the rep range reached, a weight step more for the bottom of the range; three
--   times running short of the bottom, a step less for its middle; otherwise the same weight for
--   one rep more, up to the top. Done with the body's weight, one rep more.
-- - a time: its target time reached, 5 seconds more; otherwise the target time. The weight stays.
-- - a distance, or an exercise never done: none, and the set starts from last time as before.
create function public.set_targets(workout_id bigint)
returns table (
  exercise_position smallint,
  exercise_id text,
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
    exercise_id := exercise.exercise_id;
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
