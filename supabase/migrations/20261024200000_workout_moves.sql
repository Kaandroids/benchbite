-- Workouts move within their week (#144, ADR 0028). A move takes a workout from one of its
-- weekdays (from_on) to another day of the same week (to_on), for that week only: the workout
-- keeps its weekdays. A move without a target skips the workout that week.
--
-- Days are the device's dates, as for weight entries, so the database only knows today to within
-- a day either way. It checks what a move may be; the app works out the week from the plan, the
-- moves and the logs.
--
-- Errors:
--   BB019  a move does not fit the plan

create table public.workout_moves (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id bigint not null references public.workouts (id) on delete cascade,
  from_on date not null,
  -- Null for a workout skipped that week.
  to_on date,
  created_at timestamptz not null default now(),
  -- A workout's day moves once; moving it again changes the target.
  unique (workout_id, from_on),
  -- A workout is on a day at most once.
  unique (workout_id, to_on),
  check (
    to_on is null
    or (to_on <> from_on and date_trunc('week', to_on) = date_trunc('week', from_on))
  )
);

create index workout_moves_user_id_from_on_idx on public.workout_moves (user_id, from_on);

-- Users read and undo their own moves. Moves are written only by move_workout() and
-- log_workout(), which check them against the plan.
alter table public.workout_moves enable row level security;

create policy "Users read their own workout moves"
  on public.workout_moves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users delete their own workout moves"
  on public.workout_moves for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.workout_moves from anon, authenticated;
grant select, delete on public.workout_moves to authenticated;

-- Whether a workout may move from from_on to to_on, or be skipped on from_on when to_on is null:
--   - the workout is active and from_on is one of its weekdays, in this week;
--   - the target is in the same week, today or later, and not a day the workout is already on,
--     by its weekdays or by another move.
-- "This week" and "today" allow a day either way for the device's time zone.
create function public.move_fits(source public.workouts, from_on date, to_on date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select source.active
    and extract(isodow from from_on)::smallint = any(source.weekdays)
    and date_trunc('week', from_on)
      between date_trunc('week', current_date - 1) and date_trunc('week', current_date + 1)
    and (
      to_on is null
      or (
        to_on <> from_on
        and date_trunc('week', to_on) = date_trunc('week', from_on)
        and to_on >= current_date - 1
        and not extract(isodow from to_on)::smallint = any(source.weekdays)
        and not exists (
          select 1 from public.workout_moves m
          where m.workout_id = source.id and m.to_on = move_fits.to_on
            and m.from_on <> move_fits.from_on
        )
      )
    );
$$;

revoke execute on function public.move_fits(public.workouts, date, date)
  from public, anon, authenticated;

-- Moves one of the caller's workouts from from_on to to_on this week, or skips it on from_on when
-- to_on is null. Moving a day that already moved changes its target.
create function public.move_workout(workout_id bigint, from_on date, to_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  source public.workouts;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select * into source
  from public.workouts w
  where w.id = move_workout.workout_id and w.user_id = caller_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;

  if from_on is null or not public.move_fits(source, from_on, to_on) then
    raise exception 'The move does not fit the plan' using errcode = 'BB019';
  end if;

  insert into public.workout_moves (user_id, workout_id, from_on, to_on)
  values (caller_id, source.id, move_workout.from_on, move_workout.to_on)
  on conflict on constraint workout_moves_workout_id_from_on_key
  do update set to_on = excluded.to_on, created_at = now();
end;
$$;

revoke execute on function public.move_workout(bigint, date, date) from public, anon;
grant execute on function public.move_workout(bigint, date, date) to authenticated;

-- Unchanged apart from the move: a workout started on another day than planned can say which
-- day it replaces, {"move": {"from": "2026-10-20", "to": "2026-10-22"}}, and the move is saved
-- with the log. A move that no longer fits, as when the plan changed during the workout, is left
-- out rather than losing the log.
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
  log_client_id uuid := (log ->> 'clientId')::uuid;
  move_from date := (log #>> '{move,from}')::date;
  move_to date := (log #>> '{move,to}')::date;
  source public.workouts;
  new_log_id bigint;
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

  if started is null or finished is null or finished <= started
    or finished - started > interval '12 hours' or finished > now() + interval '5 minutes' then
    raise exception 'The workout''s start and end do not make sense' using errcode = 'BB012';
  end if;

  select * into source from public.workouts w where w.id = source_id and w.user_id = caller_id;
  if not found then
    raise exception 'Workout not found' using errcode = 'BB006';
  end if;

  perform public.check_sets(log);

  -- Two copies of one log arriving at once: the second inserts nothing and returns the first.
  insert into public.workout_logs (
    user_id, workout_id, name, type, started_at, finished_at, planned_exercises, planned_sets,
    planned_exercise_ids, estimated_kcal, client_id
  )
  values (
    caller_id, source_id, source.name, source.type, started, finished,
    (log ->> 'plannedExercises')::smallint, (log ->> 'plannedSets')::smallint,
    (
      select array_agg(e.value ->> 'exerciseId' order by e.ordinality)
      from jsonb_array_elements(log -> 'exercises') with ordinality e
    ),
    round(
      public.my_strength_kcal_per_minute() * extract(epoch from finished - started) / 60
    )::integer,
    log_client_id
  )
  on conflict (user_id, client_id) where client_id is not null do nothing
  returning id into new_log_id;

  if new_log_id is null then
    select l.id into new_log_id
    from public.workout_logs l
    where l.user_id = caller_id and l.client_id = log_client_id;
    return new_log_id;
  end if;

  -- Exercises without sets leave gaps in the positions, which keep the workout's order.
  insert into public.logged_sets (
    log_id, user_id, exercise_position, set_position, exercise_id, weight_kg, reps, seconds, meters
  )
  select new_log_id, caller_id, exercise_position, set_position, exercise_id, weight_kg, reps,
    seconds, meters
  from public.sets_of(log);

  if move_from is not null and move_to is not null
    and public.move_fits(source, move_from, move_to) then
    insert into public.workout_moves (user_id, workout_id, from_on, to_on)
    values (caller_id, source.id, move_from, move_to)
    on conflict on constraint workout_moves_workout_id_from_on_key
    do update set to_on = excluded.to_on, created_at = now();
  end if;

  return new_log_id;
end;
$$;
