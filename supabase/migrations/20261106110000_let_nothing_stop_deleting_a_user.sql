-- Lets a user be deleted whatever they have (#134, ADR 0087), and closes the two ways photos could
-- outlive them.

-- A food goes through the user's foreign key before the recipes that hold it do, so an ingredient
-- would stop the delete. The foreign key itself stays as it is: undoing a meal estimate or card
-- relies on it to leave a food that a recipe uses. So only with the user gone do the ingredients go.
create function public.remove_ingredients_of_deleted_users_food()
returns trigger
language plpgsql
-- Reads auth.users, which callers may not.
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    delete from public.recipe_ingredients i where i.custom_food_id = old.id;
  end if;
  return old;
end;
$$;

revoke execute on function public.remove_ingredients_of_deleted_users_food()
  from public, anon, authenticated;

create trigger custom_foods_remove_ingredients_of_deleted_user
  before delete on public.custom_foods
  for each row execute function public.remove_ingredients_of_deleted_users_food();

-- As before (20261103090000), but a deleted user's workouts go whichever row goes first. Which does
-- depends on the order of the foreign keys' triggers, which nothing guarantees.
create or replace function public.refuse_held_workout_rows()
returns trigger
language plpgsql
-- Reads auth.users, which callers may not. It reads only whether a workout waits.
security definer
set search_path = ''
as $$
declare
  workout_id bigint := case when tg_op = 'DELETE' then old.workout_id else new.workout_id end;
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  if public.is_held_workout(workout_id) then
    raise exception 'The workout waits for premium' using errcode = 'BB051';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.refuse_held_workout_rows() from public, anon, authenticated;

-- As before (20261024190000), but a token that outlives its user uploads nothing, as nothing would
-- ever remove the file.
create or replace function public.can_upload_exercise_photo()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if not exists (select 1 from auth.users u where u.id = caller_id) then
    return false;
  end if;
  perform public.lock_user_limits(caller_id);
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'exercise-photos' and o.name like caller_id::text || '/%'
  ) < 2 * public.custom_exercise_limit();
end;
$$;

-- Photos sit directly in the user's folder, as the app writes them and as deleting a user removes
-- them.
drop policy "Users upload their own exercise photos" on storage.objects;
create policy "Users upload their own exercise photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'exercise-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and cardinality(storage.foldername(name)) = 1
    and public.can_upload_exercise_photo()
  );
