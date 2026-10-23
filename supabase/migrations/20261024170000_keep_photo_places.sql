-- The photos of a custom exercise keep their places (codebase review). "imagePaths" lists the start
-- and the end of a rep, so an exercise with only a photo of the end names it second, after a null.
-- Before, the app left out the missing start and the end became the start; and a null was let
-- through anywhere, as a comparison with null is never true.
--
-- Unchanged apart from where a null may stand: only first, before the photo of the end.
create or replace function public.custom_exercise_fields(exercise jsonb)
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
      select 1 from unnest(image_paths) with ordinality p (path, position)
      where case
        when path is null then position <> 1 or cardinality(image_paths) <> 2
        else path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$')
      end
    )
  then
    raise exception 'The exercise is not valid' using errcode = 'BB014';
  end if;
  return next;
end;
$$;
