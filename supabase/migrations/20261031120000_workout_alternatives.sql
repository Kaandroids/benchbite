-- Alternatives of a workout: other versions of its exercises, such as one for the gym and one for
-- home, of which one is in use (#346, ADR 0061). The one in use is the workout everywhere: its
-- exercises stay in workout_exercises, so nothing that reads a workout changes, and editing the
-- workout edits it. The others keep their exercises as saved_workout() reads them, until one is
-- put in use through save_workout(). A workout without alternatives has no rows here, as before.

create table public.workout_alternatives (
  id bigint generated always as identity primary key,
  workout_id bigint not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The order of the chips. Checked at the end of each statement, so that one update can reorder.
  -- How many a workout may have is workout_limits()', which add_workout_alternative() keeps to.
  position smallint not null check (position >= 1),
  -- Optional; the app shows an unnamed one as "Alternative N".
  name text check (char_length(name) between 1 and 12 and name = btrim(name)),
  in_use boolean not null,
  -- The exercises as saved_workout() reads them; null for the one in use, whose exercises are the
  -- workout's own.
  exercises jsonb check (
    jsonb_typeof(exercises) = 'array' and octet_length(exercises::text) <= 16384
  ),
  check (in_use = (exercises is null)),
  unique (workout_id, position) deferrable initially immediate
);

create index workout_alternatives_user_id on public.workout_alternatives (user_id);
create unique index workout_alternatives_one_in_use on public.workout_alternatives (workout_id)
  where in_use;

-- Users read their own alternatives; only the functions below write them.
alter table public.workout_alternatives enable row level security;

create policy "Users read their own workout alternatives"
  on public.workout_alternatives for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.workout_alternatives from anon;
revoke insert, update, delete, truncate on public.workout_alternatives from authenticated;

-- The app reads the number of alternatives with the other limits. Adding a column changes the
-- result's type, so the function is made again; save_workout() reads its columns by name.
drop function public.workout_limits();
create function public.workout_limits()
returns table (exercises integer, workouts integer, alternatives integer)
language sql
stable
set search_path = ''
as $$
  select 20, 3, 5;
$$;

revoke execute on function public.workout_limits from public, anon;
grant execute on function public.workout_limits to authenticated;

-- Takes the caller's lock, as save_workout() does, then their workout's row, so that the
-- alternatives and the workout's exercises change together. Only the functions below call it.
create function public.lock_own_workout(workout_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.lock_user_limits((select auth.uid()));
  perform 1 from public.workouts w
  where w.id = lock_own_workout.workout_id and w.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;
end;
$$;

-- The caller's alternative `alternative_id`, after locking its workout as lock_own_workout() does.
create function public.lock_own_alternative(alternative_id bigint)
returns public.workout_alternatives
language plpgsql
set search_path = ''
as $$
declare
  alternative public.workout_alternatives;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into alternative from public.workout_alternatives a
  where a.id = lock_own_alternative.alternative_id and a.user_id = (select auth.uid());
  if not found then
    raise exception 'Alternative not found' using errcode = 'P0002';
  end if;
  -- The locks, then the row again, as it may have changed or gone while waiting.
  perform public.lock_own_workout(alternative.workout_id);
  select * into alternative from public.workout_alternatives a
  where a.id = lock_own_alternative.alternative_id and a.user_id = (select auth.uid());
  if not found then
    raise exception 'Alternative not found' using errcode = 'P0002';
  end if;
  return alternative;
end;
$$;

-- Numbers the alternatives of `workout_id` 1, 2, … in their order, after one is deleted. A single
-- one left is the workout itself, so it goes too, and the workout has no alternatives again.
create function public.renumber_workout_alternatives(workout_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (
    select count(*) from public.workout_alternatives a
    where a.workout_id = renumber_workout_alternatives.workout_id
  ) = 1 then
    delete from public.workout_alternatives a
    where a.workout_id = renumber_workout_alternatives.workout_id;
    return;
  end if;
  update public.workout_alternatives a set position = n.position
  from (
    select o.id, row_number() over (order by o.position)::smallint as position
    from public.workout_alternatives o
    where o.workout_id = renumber_workout_alternatives.workout_id
  ) n
  where a.id = n.id and a.position <> n.position;
end;
$$;

-- Adds an alternative to the caller's `workout_id`, named `name` (blank for none), and gives its
-- id. Without `exercises` it is a copy of the one in use; with them, they must make a workout that
-- save_workout() saves, which is tried on the device's `today` and rolled back, so that its own
-- checks refuse them now rather than when the alternative is put in use. They are kept as
-- saved_workout() reads them back. The first one added makes the workout's own exercises the
-- first alternative, in use. A workout has at most 5 (BB041).
create function public.add_workout_alternative(
  workout_id bigint,
  name text,
  exercises jsonb,
  today date
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
begin
  perform public.lock_own_workout(add_workout_alternative.workout_id);
  workout := public.saved_workout(add_workout_alternative.workout_id);

  if (
    select count(*) from public.workout_alternatives a
    where a.workout_id = add_workout_alternative.workout_id
  ) >= (select l.alternatives from public.workout_limits() l) then
    raise exception 'A workout can have up to % alternatives',
      (select l.alternatives from public.workout_limits() l)
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
    insert into public.workout_alternatives (workout_id, user_id, position, in_use)
    values (add_workout_alternative.workout_id, caller_id, 1, true);
  end if;

  insert into public.workout_alternatives (workout_id, user_id, position, name, in_use, exercises)
  values (
    add_workout_alternative.workout_id,
    caller_id,
    (
      select max(a.position) + 1 from public.workout_alternatives a
      where a.workout_id = add_workout_alternative.workout_id
    ),
    nullif(btrim(add_workout_alternative.name), ''),
    false,
    kept
  )
  returning id into added_id;
  return added_id;
end;
$$;

-- Puts the caller's `alternative_id` of `workout_id` in use from the device's `today`: the
-- exercises of the one in use are kept in its row, as saved_workout() reads them, and the chosen
-- one's become the workout's through save_workout(), with its checks and the days kept before
-- today (ADR 0041). The workout's name and weekdays stay. Choosing the one in use changes nothing.
create function public.use_workout_alternative(workout_id bigint, alternative_id bigint, today date)
returns void
language plpgsql
-- As add_workout_alternative().
security definer
set search_path = ''
as $$
declare
  chosen public.workout_alternatives;
  workout jsonb;
begin
  perform public.lock_own_workout(use_workout_alternative.workout_id);
  select * into chosen from public.workout_alternatives a
  where a.id = use_workout_alternative.alternative_id
    and a.workout_id = use_workout_alternative.workout_id;
  if not found then
    raise exception 'Alternative not found' using errcode = 'P0002';
  end if;
  if chosen.in_use then
    return;
  end if;

  workout := public.saved_workout(use_workout_alternative.workout_id);
  update public.workout_alternatives a
  set in_use = false, exercises = workout -> 'exercises'
  where a.workout_id = use_workout_alternative.workout_id and a.in_use;
  update public.workout_alternatives a
  set in_use = true, exercises = null
  where a.id = chosen.id;
  perform public.save_workout(
    workout || jsonb_build_object('exercises', chosen.exercises),
    use_workout_alternative.today
  );
end;
$$;

-- Names the caller's `alternative_id` `name`, or leaves it unnamed when blank.
create function public.rename_workout_alternative(alternative_id bigint, name text)
returns void
language plpgsql
-- As add_workout_alternative().
security definer
set search_path = ''
as $$
begin
  perform public.lock_own_alternative(rename_workout_alternative.alternative_id);
  update public.workout_alternatives a
  set name = nullif(btrim(rename_workout_alternative.name), '')
  where a.id = rename_workout_alternative.alternative_id;
end;
$$;

-- Deletes the caller's `alternative_id`, never the one in use (BB042), which another must be put
-- in use first. Deleting down to one leaves the workout as it is, without alternatives.
create function public.delete_workout_alternative(alternative_id bigint)
returns void
language plpgsql
-- As add_workout_alternative().
security definer
set search_path = ''
as $$
declare
  alternative public.workout_alternatives :=
    public.lock_own_alternative(delete_workout_alternative.alternative_id);
begin
  if alternative.in_use then
    raise exception 'The alternative in use cannot be deleted' using errcode = 'BB042';
  end if;
  delete from public.workout_alternatives a where a.id = alternative.id;
  perform public.renumber_workout_alternatives(alternative.workout_id);
end;
$$;

-- Puts the alternatives of the caller's `workout_id` in the order of `alternative_ids`, which name
-- each of them once.
create function public.reorder_workout_alternatives(workout_id bigint, alternative_ids bigint[])
returns void
language plpgsql
-- As add_workout_alternative().
security definer
set search_path = ''
as $$
begin
  perform public.lock_own_workout(reorder_workout_alternatives.workout_id);
  if coalesce(cardinality(alternative_ids), 0) <> (
    select count(*) from public.workout_alternatives a
    where a.workout_id = reorder_workout_alternatives.workout_id
  ) or exists (
    select 1 from unnest(alternative_ids) i
    where i is null or not exists (
      select 1 from public.workout_alternatives a
      where a.id = i and a.workout_id = reorder_workout_alternatives.workout_id
    )
  ) or cardinality(alternative_ids) <> (select count(distinct i) from unnest(alternative_ids) i)
  then
    raise exception 'The order names each alternative of the workout once'
      using errcode = '22023';
  end if;

  update public.workout_alternatives a set position = i.position
  from unnest(alternative_ids) with ordinality i(id, position)
  where a.id = i.id and a.position <> i.position;
end;
$$;

-- The helpers run only inside the functions above.
revoke all on function public.lock_own_workout(bigint) from public, anon, authenticated;
revoke all on function public.lock_own_alternative(bigint) from public, anon, authenticated;
revoke all on function public.renumber_workout_alternatives(bigint)
  from public, anon, authenticated;

revoke all on function public.add_workout_alternative(bigint, text, jsonb, date) from public, anon;
grant execute on function public.add_workout_alternative(bigint, text, jsonb, date) to authenticated;
revoke all on function public.use_workout_alternative(bigint, bigint, date) from public, anon;
grant execute on function public.use_workout_alternative(bigint, bigint, date) to authenticated;
revoke all on function public.rename_workout_alternative(bigint, text) from public, anon;
grant execute on function public.rename_workout_alternative(bigint, text) to authenticated;
revoke all on function public.delete_workout_alternative(bigint) from public, anon;
grant execute on function public.delete_workout_alternative(bigint) to authenticated;
revoke all on function public.reorder_workout_alternatives(bigint, bigint[]) from public, anon;
grant execute on function public.reorder_workout_alternatives(bigint, bigint[]) to authenticated;

-- As before (20261024150000_keep_targets_suited.sql), and an alternative not in use keeps a
-- target for the exercise too: changing what it records would leave that alternative one that
-- can never be put in use again, nor edited.
create or replace function public.edit_exercise(exercise_id text, exercise jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_metrics public.exercise_metric[];
  fields record;
begin
  select x.metrics into current_metrics
  from public.exercises x
  where x.id = edit_exercise.exercise_id and x.owner_id = caller_id
  for update;
  if not found then
    raise exception 'Exercise not found' using errcode = 'BB015';
  end if;
  select * into fields from public.custom_exercise_fields(exercise);
  if fields.metrics <> current_metrics and exists (
    select 1 from public.logged_sets s where s.exercise_id = edit_exercise.exercise_id
  ) then
    raise exception 'What the exercise records cannot change once it is logged'
      using errcode = 'BB016';
  end if;
  -- A workout keeps a target that suits what the exercise records, archived workouts too, and
  -- their alternatives.
  if fields.metrics <> current_metrics and (
    exists (
      select 1 from public.workout_exercises w where w.exercise_id = edit_exercise.exercise_id
    )
    or exists (
      select 1 from public.workout_alternatives a
      where a.user_id = caller_id
        and a.exercises @> jsonb_build_array(
          jsonb_build_object('exerciseId', edit_exercise.exercise_id)
        )
    )
  ) then
    raise exception 'What the exercise records cannot change while a workout has it'
      using errcode = 'BB018';
  end if;
  update public.exercises x set
    name = fields.name,
    level = fields.level,
    category =
      (case when 'distance' = any(fields.metrics) then 'cardio' else 'strength' end)::public.exercise_category,
    equipment = fields.equipment,
    primary_muscles = fields.primary_muscles,
    secondary_muscles = fields.secondary_muscles,
    instructions = fields.instructions,
    image_paths = fields.image_paths,
    metrics = fields.metrics
  where x.id = edit_exercise.exercise_id;
end;
$$;
