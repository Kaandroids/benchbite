-- add_workout_alternative() (20261031120000_workout_alternatives.sql) takes its name and exercises
-- as optional, so that the app leaves them out for an unnamed copy of the one in use rather than
-- passing nulls the generated types do not allow. Optional parameters come last, so `today` moves
-- before them, which needs the function dropped. As before otherwise.

drop function public.add_workout_alternative(bigint, text, jsonb, date);

create function public.add_workout_alternative(
  workout_id bigint,
  today date,
  name text default null,
  exercises jsonb default null
)
returns bigint
language plpgsql
-- Writes alternatives, which callers may only read, and reads saved_workout(), which they may not.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  workout jsonb;
  kept jsonb;
  added_id bigint;
  max_alternatives integer := (select l.alternatives from public.workout_limits() l);
begin
  perform public.lock_own_workout(add_workout_alternative.workout_id);
  workout := public.saved_workout(add_workout_alternative.workout_id);

  if (
    select count(*) from public.workout_alternatives a
    where a.workout_id = add_workout_alternative.workout_id
  ) >= max_alternatives then
    raise exception 'A workout can have up to % alternatives', max_alternatives
      using errcode = 'BB041';
  end if;

  if add_workout_alternative.exercises is null then
    kept := workout -> 'exercises';
  else
    if jsonb_typeof(add_workout_alternative.exercises) <> 'array' then
      raise exception 'Exercises are a list' using errcode = '22023';
    end if;
    -- As propose_coach_change(): nothing but BBTRY may be caught here, or the tried workout would
    -- be kept. The variable keeps what was read before the rollback.
    begin
      perform public.save_workout(
        workout || jsonb_build_object('exercises', add_workout_alternative.exercises),
        add_workout_alternative.today
      );
      kept := public.saved_workout(add_workout_alternative.workout_id) -> 'exercises';
      raise exception 'Tried' using errcode = 'BBTRY';
    exception when sqlstate 'BBTRY' then
      null;
    end;
  end if;

  if not exists (
    select 1 from public.workout_alternatives a
    where a.workout_id = add_workout_alternative.workout_id
  ) then
    insert into public.workout_alternatives (workout_id, user_id, position)
    values (add_workout_alternative.workout_id, caller_id, 1);
  end if;

  insert into public.workout_alternatives (workout_id, user_id, position, name, exercises)
  values (
    add_workout_alternative.workout_id,
    caller_id,
    (
      select max(a.position) + 1 from public.workout_alternatives a
      where a.workout_id = add_workout_alternative.workout_id
    ),
    nullif(btrim(add_workout_alternative.name), ''),
    kept
  )
  returning id into added_id;
  return added_id;
end;
$$;

revoke all on function public.add_workout_alternative(bigint, date, text, jsonb) from public, anon;
grant execute on function public.add_workout_alternative(bigint, date, text, jsonb) to authenticated;
