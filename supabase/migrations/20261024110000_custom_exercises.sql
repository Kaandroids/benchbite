-- Users create their own exercises next to the library (#33, ADR 0026). A custom exercise is a
-- row of exercises with an owner; only its owner sees it. It is created, edited and archived
-- through the functions below, which check what it records and keep the library read-only.
-- Archiving takes it out of the lists while its history, records and progress stay.
--
-- Errors:
--   BB014  the exercise is not valid (name, what it records, muscles, level or steps)
--   BB015  exercise not found, or not the caller's
--   BB016  what an exercise records cannot change once it has logged sets
--   BB017  too many custom exercises

alter table public.exercises
  add column owner_id uuid references auth.users (id) on delete cascade,
  add column archived_at timestamptz,
  -- Only custom exercises are archived.
  add constraint exercises_archived_custom check (archived_at is null or owner_id is not null);

create index exercises_owner_id_idx on public.exercises (owner_id) where owner_id is not null;

-- The library stays readable by everyone; a custom exercise only by its owner.
drop policy "Exercises are readable by everyone" on public.exercises;

create policy "The library and the caller's own exercises are readable"
  on public.exercises for select
  to anon, authenticated
  using (owner_id is null or owner_id = (select auth.uid()));

-- The ways an exercise can be logged (ADR 0008), as the app offers them.
create function public.metrics_valid(metrics public.exercise_metric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select metrics in (
    array['weight', 'reps']::public.exercise_metric[],
    array['reps']::public.exercise_metric[],
    array['duration']::public.exercise_metric[],
    array['distance', 'duration']::public.exercise_metric[]
  );
$$;

-- Reads and checks the fields of a custom exercise as the app sends them:
--   {"name": "Hip thrust machine", "metrics": ["weight", "reps"],
--    "primaryMuscles": ["glutes"], "secondaryMuscles": ["hamstrings"],
--    "equipment": "machine", "level": "beginner", "instructions": ["Sit with ..."]}
create function public.custom_exercise_fields(exercise jsonb)
returns table (
  name text,
  metrics public.exercise_metric[],
  primary_muscles public.muscle[],
  secondary_muscles public.muscle[],
  equipment public.equipment,
  level public.exercise_level,
  instructions text[]
)
language plpgsql
stable
set search_path = ''
as $$
begin
  begin
    name := btrim(exercise ->> 'name');
    metrics := array(select jsonb_array_elements_text(exercise -> 'metrics'))::public.exercise_metric[];
    primary_muscles := array(
      select distinct jsonb_array_elements_text(exercise -> 'primaryMuscles')
    )::public.muscle[];
    secondary_muscles := array(
      select distinct m from jsonb_array_elements_text(coalesce(exercise -> 'secondaryMuscles', '[]')) m
      where m <> all (array(select jsonb_array_elements_text(exercise -> 'primaryMuscles')))
    )::public.muscle[];
    equipment := (exercise ->> 'equipment')::public.equipment;
    level := coalesce(exercise ->> 'level', 'beginner')::public.exercise_level;
    instructions := array(
      select btrim(step) from jsonb_array_elements_text(coalesce(exercise -> 'instructions', '[]')) step
      where btrim(step) <> ''
    );
  exception
    when invalid_text_representation or invalid_parameter_value or wrong_object_type then
      raise exception 'The exercise is not valid' using errcode = 'BB014';
  end;
  if name is null or char_length(name) not between 1 and 80
    or not public.metrics_valid(metrics)
    or cardinality(primary_muscles) not between 1 and 5
    or cardinality(secondary_muscles) > 10
    or cardinality(instructions) > 20
    or exists (select 1 from unnest(instructions) step where char_length(step) > 500)
  then
    raise exception 'The exercise is not valid' using errcode = 'BB014';
  end if;
  return next;
end;
$$;

-- Creates a custom exercise for the caller and returns its id.
create function public.create_exercise(exercise jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  new_id text := 'custom-' || gen_random_uuid();
  fields record;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.exercises x where x.owner_id = caller_id) >= 500 then
    raise exception 'Too many custom exercises' using errcode = 'BB017';
  end if;
  select * into fields from public.custom_exercise_fields(exercise);
  insert into public.exercises (
    id, owner_id, name, level, category, equipment, primary_muscles, secondary_muscles,
    instructions, image_paths, metrics
  ) values (
    new_id, caller_id, fields.name, fields.level,
    (case when 'distance' = any(fields.metrics) then 'cardio' else 'strength' end)::public.exercise_category,
    fields.equipment, fields.primary_muscles, fields.secondary_muscles, fields.instructions,
    '{}', fields.metrics
  );
  return new_id;
end;
$$;

-- Replaces the fields of the caller's custom exercise. What it records cannot change once it
-- has logged sets, as they would no longer suit it.
create function public.edit_exercise(exercise_id text, exercise jsonb)
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
  update public.exercises x set
    name = fields.name,
    level = fields.level,
    category =
      (case when 'distance' = any(fields.metrics) then 'cardio' else 'strength' end)::public.exercise_category,
    equipment = fields.equipment,
    primary_muscles = fields.primary_muscles,
    secondary_muscles = fields.secondary_muscles,
    instructions = fields.instructions,
    metrics = fields.metrics
  where x.id = edit_exercise.exercise_id;
end;
$$;

-- Archives the caller's custom exercise, or brings it back.
create function public.archive_exercise(exercise_id text, archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.exercises x
  set archived_at = case when archived then coalesce(x.archived_at, now()) end
  where x.id = archive_exercise.exercise_id and x.owner_id = auth.uid();
  if not found then
    raise exception 'Exercise not found' using errcode = 'BB015';
  end if;
end;
$$;

revoke execute on function public.create_exercise, public.edit_exercise, public.archive_exercise
  from public, anon;
grant execute on function public.create_exercise, public.edit_exercise, public.archive_exercise
  to authenticated;

-- Workouts and logs are saved by functions that bypass row level security, so a row may only
-- name a custom exercise of its own user. Library exercises have no owner.
create function public.check_exercise_owner()
returns trigger
language plpgsql
-- Sees every exercise, also another user's, which row level security would hide.
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.exercises x
    where x.id = new.exercise_id and x.owner_id <> new.user_id
  ) then
    raise exception 'Exercise not found' using errcode = 'BB015';
  end if;
  return new;
end;
$$;

create trigger workout_exercises_check_exercise_owner
  before insert or update of exercise_id, user_id on public.workout_exercises
  for each row execute function public.check_exercise_owner();

create trigger logged_sets_check_exercise_owner
  before insert or update of exercise_id, user_id on public.logged_sets
  for each row execute function public.check_exercise_owner();
