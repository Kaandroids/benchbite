-- Bite's workout changes are built in the database (#297, ADR 0058): the tool names the exercises
-- to swap, and the workout they go into is read with saved_workout(), the one place that reads a
-- workout as save_workout() takes it.

-- Proposes swapping exercises of the caller's `workout_id`, each of `swaps` naming the exercise to
-- `replace` with the one to put in its place (`with`), its `sets` and `target`; the rest of the
-- workout stays as it is, its rest too. Swaps match the workout as it is: an exercise not in it
-- (BB039), or one swapped twice or into another swap (BB040), is refused, so that the card shows
-- what applying does. Gives the proposal's id, as propose_coach_change() does.
create function public.propose_coach_swaps(
  thread_id bigint,
  workout_id bigint,
  swaps jsonb,
  today date
)
returns bigint
language plpgsql
-- Reads the workout with saved_workout(), which callers may not.
security definer
set search_path = ''
as $$
declare
  workout jsonb := public.saved_workout(propose_coach_swaps.workout_id);
  present text[];
  replaced text[];
  swapped jsonb;
begin
  if workout is null then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
  if jsonb_typeof(swaps) <> 'array' or jsonb_array_length(swaps) = 0 then
    raise exception 'Swaps are a list of at least one' using errcode = '22023';
  end if;

  present := array(select e ->> 'exerciseId' from jsonb_array_elements(workout -> 'exercises') e);
  replaced := array(select s ->> 'replace' from jsonb_array_elements(swaps) s);
  if not replaced <@ present then
    raise exception 'An exercise to replace is not in the workout' using errcode = 'BB039';
  end if;
  if cardinality(replaced) <> (select count(distinct r) from unnest(replaced) r)
    or exists (
      select 1 from jsonb_array_elements(swaps) s where s ->> 'with' = any (replaced)
    ) then
    raise exception 'Swaps overlap' using errcode = 'BB040';
  end if;

  swapped := (
    select jsonb_agg(
      case when swap.value is null then e.value
        else e.value || jsonb_build_object(
          'exerciseId', swap.value ->> 'with',
          'sets', swap.value -> 'sets',
          'target', swap.value -> 'target'
        )
      end
      order by e.ordinality
    )
    from jsonb_array_elements(workout -> 'exercises') with ordinality e
    left join lateral (
      select s.value from jsonb_array_elements(swaps) s
      where s.value ->> 'replace' = e.value ->> 'exerciseId'
    ) swap on true
  );

  return public.propose_coach_change(
    propose_coach_swaps.thread_id,
    'workout',
    workout || jsonb_build_object('exercises', swapped),
    propose_coach_swaps.today
  );
end;
$$;

revoke all on function public.propose_coach_swaps(bigint, bigint, jsonb, date) from public, anon;
grant execute on function public.propose_coach_swaps(bigint, bigint, jsonb, date) to authenticated;
