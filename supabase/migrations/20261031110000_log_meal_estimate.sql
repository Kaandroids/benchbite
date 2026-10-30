-- Logs a meal estimated from photos (#299, #357, ADR 0060) in one step, and takes it back in one
-- step: each item is logged at its grams, a food of the library or of the user's own by its id,
-- and an item the library did not have as a food of the user's own, named by its search name with
-- the model's values per 100 g. An own food of that name is used rather than made again. Either
-- everything is logged or nothing.

-- The model's values per 100 g made to pass the checks of custom_foods (migration
-- 20261027200000_custom_foods.sql), which must change with them: each value within its range,
-- protein, carbs and fat at most 100 g together, and no fewer calories than they make at 4, 4 and
-- 9 kcal per gram, beyond the allowance of greatest(10, 15 %) for rounding.
create function public.fitted_food_values(
  given_kcal numeric,
  given_protein_g numeric,
  given_carbs_g numeric,
  given_fat_g numeric,
  out kcal numeric,
  out protein_g numeric,
  out carbs_g numeric,
  out fat_g numeric
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  protein numeric := least(greatest(given_protein_g, 0), 100);
  carbs numeric := least(greatest(given_carbs_g, 0), 100);
  fat numeric := least(greatest(given_fat_g, 0), 100);
  macros numeric := protein + carbs + fat;
  energy numeric;
begin
  if macros > 100 then
    protein := floor(protein * 100 / macros * 100) / 100;
    carbs := floor(carbs * 100 / macros * 100) / 100;
    fat := floor(fat * 100 / macros * 100) / 100;
  end if;
  protein_g := round(protein, 2);
  carbs_g := round(carbs, 2);
  fat_g := round(fat, 2);
  energy := 4 * protein_g + 4 * carbs_g + 9 * fat_g;
  kcal := round(least(greatest(given_kcal, 0), 900), 1);
  if energy - kcal > greatest(10, 0.15 * energy) then
    kcal := least(ceil(energy * 10) / 10, 900);
  end if;
end;
$$;

-- log_meal_estimate() runs with the caller's rights, so signed-in users run this too.
revoke execute on function public.fitted_food_values(numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.fitted_food_values(numeric, numeric, numeric, numeric)
  to authenticated;

create function public.log_meal_estimate(
  day date,
  meal public.meal,
  items jsonb
)
returns table (entry_id bigint, custom_food_id bigint, created_food boolean, kcal numeric)
language plpgsql
-- The caller's rights: row level security, the grants and the limits on foods and entries apply
-- as when the app adds them one by one.
set search_path = ''
as $$
declare
  item jsonb;
  food_name text;
  fitted record;
  own_id bigint;
  created boolean;
begin
  -- As many as an estimate gives (MAX_ESTIMATE_ITEMS in _shared/meal/estimate.ts).
  if items is null
    or jsonb_typeof(items) <> 'array'
    or jsonb_array_length(items) not between 1 and 12 then
    raise exception 'An estimate has 1 to 12 items' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(items)
  loop
    created := false;
    own_id := null;
    if item ? 'name' then
      food_name := left(trim(item ->> 'name'), 120);
      -- Looked up first, as the limit on own foods is checked before an insert's conflict is:
      -- a user at the limit can still log a food they have.
      select c.id into own_id
      from public.custom_foods c
      where c.user_id = (select auth.uid())
        and c.archived_at is null
        and public.food_name_key(c.name) = public.food_name_key(food_name);
      if own_id is null then
        select * into fitted from public.fitted_food_values(
          (item ->> 'kcal')::numeric, (item ->> 'protein_g')::numeric,
          (item ->> 'carbs_g')::numeric, (item ->> 'fat_g')::numeric
        );
        -- The unique name decides between two estimates logged at once.
        insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
        values (food_name, fitted.kcal, fitted.protein_g, fitted.carbs_g, fitted.fat_g)
        on conflict (user_id, (public.food_name_key(name))) where archived_at is null do nothing
        returning id into own_id;
        created := own_id is not null;
        if not created then
          select c.id into own_id
          from public.custom_foods c
          where c.user_id = (select auth.uid())
            and c.archived_at is null
            and public.food_name_key(c.name) = public.food_name_key(food_name);
        end if;
      end if;
      insert into public.meal_entries as e (day, meal, custom_food_id, grams)
      values (log_meal_estimate.day, log_meal_estimate.meal, own_id, (item ->> 'grams')::numeric)
      returning e.id, e.kcal into entry_id, kcal;
      custom_food_id := own_id;
    else
      insert into public.meal_entries as e (day, meal, food_id, custom_food_id, recipe_id, grams)
      values (
        log_meal_estimate.day, log_meal_estimate.meal, item ->> 'food_id',
        (item ->> 'custom_food_id')::bigint, (item ->> 'recipe_id')::bigint,
        (item ->> 'grams')::numeric
      )
      returning e.id, e.kcal into entry_id, kcal;
      custom_food_id := null;
    end if;
    created_food := created;
    return next;
  end loop;
end;
$$;

revoke execute on function public.log_meal_estimate(date, public.meal, jsonb)
  from public, anon;
grant execute on function public.log_meal_estimate(date, public.meal, jsonb) to authenticated;

-- Takes back a meal logged from photos: its entries go for good, as they were never eaten, and
-- the own foods it made are deleted when nothing else names them, so that logging and undoing
-- does not use up the 1,000 foods a user may add (BB026); one that something names is archived,
-- as deleting it in the app does.
create function public.undo_meal_estimate(entry_ids bigint[], food_ids bigint[])
returns void
language plpgsql
-- Owner's rights, to remove the entries' copies kept for restoring and to delete a food, which
-- users may not; each is the caller's own, checked here.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  food_id bigint;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if cardinality(entry_ids) > 12 or cardinality(food_ids) > 12 then
    raise exception 'An estimate has up to 12 items' using errcode = '22023';
  end if;

  delete from public.meal_entries e
  where e.id = any (undo_meal_estimate.entry_ids) and e.user_id = caller_id;
  -- The copies the delete kept for an hour, which would name the foods.
  delete from public.removed_meal_entries r
  where r.id = any (undo_meal_estimate.entry_ids) and r.user_id = caller_id;

  foreach food_id in array coalesce(undo_meal_estimate.food_ids, '{}')
  loop
    begin
      delete from public.custom_foods c where c.id = food_id and c.user_id = caller_id;
    exception when foreign_key_violation then
      update public.custom_foods c
      set archived_at = now()
      where c.id = food_id and c.user_id = caller_id and c.archived_at is null;
    end;
  end loop;
end;
$$;

revoke execute on function public.undo_meal_estimate(bigint[], bigint[]) from public, anon;
grant execute on function public.undo_meal_estimate(bigint[], bigint[]) to authenticated;
