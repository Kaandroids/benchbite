-- Photos of the user's own exercises, the start and the end of a rep (#33, ADR 0027). They are
-- private: each user reads and writes only their own folder, named after their id, and the app
-- shows them through short-lived signed URLs. A custom exercise names up to two of them in
-- image_paths, as library exercises name their pictures.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-photos', 'exercise-photos', false, 1048576, array['image/jpeg']);

create policy "Users read their own exercise photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'exercise-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users upload their own exercise photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'exercise-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete their own exercise photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'exercise-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The fields of a custom exercise now include its photos: "imagePaths", up to two paths in the
-- caller's folder of exercise-photos, such as "<user id>/<uuid>.jpg".
drop function public.custom_exercise_fields(jsonb);

create function public.custom_exercise_fields(exercise jsonb)
returns table (
  name text,
  metrics public.exercise_metric[],
  primary_muscles public.muscle[],
  secondary_muscles public.muscle[],
  equipment public.equipment,
  level public.exercise_level,
  instructions text[],
  image_paths text[]
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
    image_paths := array(
      select jsonb_array_elements_text(coalesce(exercise -> 'imagePaths', '[]'))
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
    or cardinality(image_paths) > 2
    or exists (
      select 1 from unnest(image_paths) path
      where path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$')
    )
  then
    raise exception 'The exercise is not valid' using errcode = 'BB014';
  end if;
  return next;
end;
$$;

create or replace function public.create_exercise(exercise jsonb)
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
    fields.image_paths, fields.metrics
  );
  return new_id;
end;
$$;

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
