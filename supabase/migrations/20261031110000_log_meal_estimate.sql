-- Logs a meal estimated from photos (#299, #357, ADR 0060) in one step: each item is logged at
-- its grams, a food of the library or of the user's own by its id, and an item the library did
-- not have as a food of the user's own, named by its search name with the model's values per
-- 100 g. An own food of that name is used rather than made again. Either everything is logged
-- or nothing.

create function public.log_meal_estimate(
  day date,
  meal public.meal,
  items jsonb
)
returns table (entry_id bigint, custom_food_id bigint, created_food boolean)
language plpgsql
-- The caller's rights: row level security, the grants and the limits on foods and entries apply
-- as when the app adds them one by one.
set search_path = ''
as $$
declare
  item jsonb;
  food_name text;
  values_kcal numeric;
  protein numeric;
  carbs numeric;
  fat numeric;
  macros numeric;
  energy numeric;
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
    if item ? 'name' then
      food_name := left(trim(item ->> 'name'), 120);
      select c.id into own_id
      from public.custom_foods c
      where c.user_id = (select auth.uid())
        and c.archived_at is null
        and public.food_name_key(c.name) = public.food_name_key(food_name);
      if own_id is null then
        -- The model's values, made to pass the checks of a food: protein, carbs and fat at most
        -- 100 g together, and no fewer calories than they make (ADR 0036).
        protein := greatest((item ->> 'protein_g')::numeric, 0);
        carbs := greatest((item ->> 'carbs_g')::numeric, 0);
        fat := greatest((item ->> 'fat_g')::numeric, 0);
        macros := protein + carbs + fat;
        if macros > 100 then
          protein := floor(protein * 100 / macros * 100) / 100;
          carbs := floor(carbs * 100 / macros * 100) / 100;
          fat := floor(fat * 100 / macros * 100) / 100;
        end if;
        protein := round(protein, 2);
        carbs := round(carbs, 2);
        fat := round(fat, 2);
        energy := 4 * protein + 4 * carbs + 9 * fat;
        values_kcal := round(greatest((item ->> 'kcal')::numeric, 0), 1);
        if energy - values_kcal > greatest(10, 0.15 * energy) then
          values_kcal := ceil(energy * 10) / 10;
        end if;
        values_kcal := least(values_kcal, 900);
        insert into public.custom_foods (name, kcal, protein_g, carbs_g, fat_g)
        values (food_name, values_kcal, protein, carbs, fat)
        returning id into own_id;
        created := true;
      end if;
      insert into public.meal_entries (day, meal, custom_food_id, grams)
      values (log_meal_estimate.day, log_meal_estimate.meal, own_id, (item ->> 'grams')::numeric)
      returning id into entry_id;
      custom_food_id := own_id;
    else
      insert into public.meal_entries (day, meal, food_id, custom_food_id, recipe_id, grams)
      values (
        log_meal_estimate.day, log_meal_estimate.meal, item ->> 'food_id',
        (item ->> 'custom_food_id')::bigint, (item ->> 'recipe_id')::bigint,
        (item ->> 'grams')::numeric
      )
      returning id into entry_id;
      custom_food_id := null;
    end if;
    created_food := created;
    own_id := null;
    return next;
  end loop;
end;
$$;

revoke execute on function public.log_meal_estimate(date, public.meal, jsonb)
  from public, anon;
grant execute on function public.log_meal_estimate(date, public.meal, jsonb) to authenticated;
