-- Recipes: a dish made of several foods, such as a lentil soup for four, logged by the serving
-- like a food (#204, ADR 0038). Only their owner sees them. A recipe's values are summed from its
-- ingredients when they are needed, and an entry copies them per 100 g (ADR 0034).
--
-- New error codes:
--   BB028  the user already has as many recipes as they may have
--   BB029  the user has added and deleted as many recipes as they may
--   BB030  the recipe was deleted, which cannot be changed or undone

create table public.recipes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  -- How many servings it makes, such as 4 bowls; one serving is the whole weight shared out.
  servings smallint not null check (servings between 1 and 50),
  serving_unit public.portion_unit not null,
  -- Set when the user deletes it, as for foods of one's own.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- A user's recipes have different names, compared as search compares them (ADR 0035).
create unique index recipes_unique_name
  on public.recipes (user_id, public.food_name_key(name))
  where archived_at is null;

create index recipes_user_id_idx on public.recipes (user_id);

create table public.recipe_ingredients (
  recipe_id bigint not null references public.recipes (id) on delete cascade,
  position smallint not null check (position between 0 and 49),
  food_id text references public.foods (id),
  custom_food_id bigint references public.custom_foods (id),
  check (num_nonnulls(food_id, custom_food_id) = 1),
  grams numeric(6, 1) not null check (grams > 0 and grams <= 5000),
  -- The portion that was picked, such as 1 onion, or null when grams were entered.
  portion_unit public.portion_unit,
  portion_count numeric(4, 1) check (portion_count > 0 and portion_count <= 100),
  check ((portion_unit is null) = (portion_count is null)),
  primary key (recipe_id, position)
);

create index recipe_ingredients_food_id_idx on public.recipe_ingredients (food_id);
create index recipe_ingredients_custom_food_id_idx on public.recipe_ingredients (custom_food_id);

-- Users read and change only their own recipes, and use only library foods and their own foods
-- in them. save_recipe() writes a recipe with its ingredients in one step; deleting archives.
alter table public.recipes enable row level security;

create policy "Users read their own recipes"
  on public.recipes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own recipes"
  on public.recipes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users change their own recipes"
  on public.recipes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.recipes from anon;
revoke insert, update, delete, truncate on public.recipes from authenticated;
grant insert (name, servings, serving_unit) on public.recipes to authenticated;
grant update (name, servings, serving_unit, archived_at) on public.recipes to authenticated;

alter table public.recipe_ingredients enable row level security;

create policy "Users read the ingredients of their recipes"
  on public.recipe_ingredients for select to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = (select auth.uid())
    )
  );
create policy "Users add ingredients to their recipes"
  on public.recipe_ingredients for insert to authenticated
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = (select auth.uid()) and r.archived_at is null
    )
    and (
      custom_food_id is null
      or exists (
        select 1 from public.custom_foods c
        where c.id = custom_food_id and c.user_id = (select auth.uid())
      )
    )
  );
create policy "Users remove ingredients from their recipes"
  on public.recipe_ingredients for delete to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.user_id = (select auth.uid()) and r.archived_at is null
    )
  );

revoke all on public.recipe_ingredients from anon;
revoke insert, update, delete, truncate on public.recipe_ingredients from authenticated;
grant insert (recipe_id, position, food_id, custom_food_id, grams, portion_unit, portion_count)
  on public.recipe_ingredients to authenticated;
grant delete on public.recipe_ingredients to authenticated;

-- Up to 100 recipes, and up to 500 counting deleted ones, as for foods of one's own.
create function public.check_recipe_limit()
returns trigger
language plpgsql
-- Calls lock_user_limits(), which callers may not execute.
security definer
set search_path = ''
as $$
declare
  active integer;
  total integer;
begin
  perform public.lock_user_limits(new.user_id);
  select count(*) filter (where r.archived_at is null), count(*)
  into active, total
  from public.recipes r
  where r.user_id = new.user_id;
  if active >= 100 then
    raise exception 'A user can have up to 100 recipes' using errcode = 'BB028';
  end if;
  if total >= 500 then
    raise exception 'A user can add up to 500 recipes, deleted ones included'
      using errcode = 'BB029';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_recipe_limit() from public, anon, authenticated;

create trigger recipes_check_limit
  before insert on public.recipes
  for each row execute function public.check_recipe_limit();

-- Deleting is for good: a deleted recipe is not changed or brought back, and the server sets the
-- time.
create function public.keep_recipe_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null then
    raise exception 'The recipe was deleted' using errcode = 'BB030';
  end if;
  if new.archived_at is not null then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_recipe_deleted() from public, anon, authenticated;

create trigger recipes_keep_deleted
  before update on public.recipes
  for each row execute function public.keep_recipe_deleted();

-- A recipe's weight and its values per 100 g, summed from its ingredients with the foods' current
-- values. An ingredient whose food left the library or was deleted still counts: the dish was
-- cooked with it. Runs as the caller, so it sees only their recipes.
create view public.recipe_values
with (security_invoker = true)
as
  select
    r.id as recipe_id,
    sum(i.grams) as grams,
    round(sum(i.grams * coalesce(f.kcal, c.kcal)) / sum(i.grams), 1) as kcal,
    round(sum(i.grams * coalesce(f.protein_g, c.protein_g)) / sum(i.grams), 2) as protein_g,
    round(sum(i.grams * coalesce(f.carbs_g, c.carbs_g)) / sum(i.grams), 2) as carbs_g,
    round(sum(i.grams * coalesce(f.fat_g, c.fat_g)) / sum(i.grams), 2) as fat_g
  from public.recipes r
  join public.recipe_ingredients i on i.recipe_id = r.id
  left join public.foods f on f.id = i.food_id
  left join public.custom_foods c on c.id = i.custom_food_id
  group by r.id;

revoke all on public.recipe_values from anon;
grant select on public.recipe_values to authenticated;

-- Adds a recipe, or changes one of the caller's, with all its ingredients in one step, and gives
-- its id. `ingredients` is a list of {food_id | custom_food_id, grams, portion_unit,
-- portion_count}, in the order shown. Runs as the caller, so the policies above apply.
create function public.save_recipe(
  recipe_id bigint,
  name text,
  servings smallint,
  serving_unit public.portion_unit,
  ingredients jsonb
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  saved_id bigint;
begin
  if jsonb_typeof(ingredients) <> 'array'
    or jsonb_array_length(ingredients) not between 1 and 50 then
    raise exception 'A recipe has 1 to 50 ingredients' using errcode = '22023';
  end if;

  if save_recipe.recipe_id is null then
    insert into public.recipes (name, servings, serving_unit)
    values (trim(save_recipe.name), save_recipe.servings, save_recipe.serving_unit)
    returning id into saved_id;
  else
    update public.recipes r
    set name = trim(save_recipe.name),
      servings = save_recipe.servings,
      serving_unit = save_recipe.serving_unit
    where r.id = save_recipe.recipe_id
    returning r.id into saved_id;
    if saved_id is null then
      raise exception 'Recipe % not found', save_recipe.recipe_id using errcode = '23503';
    end if;
    delete from public.recipe_ingredients i where i.recipe_id = saved_id;
  end if;

  insert into public.recipe_ingredients (
    recipe_id, position, food_id, custom_food_id, grams, portion_unit, portion_count
  )
  select saved_id, (item.ordinality - 1)::smallint, item.value ->> 'food_id',
    (item.value ->> 'custom_food_id')::bigint, (item.value ->> 'grams')::numeric,
    (item.value ->> 'portion_unit')::public.portion_unit,
    (item.value ->> 'portion_count')::numeric
  from jsonb_array_elements(ingredients) with ordinality as item(value, ordinality);

  return saved_id;
end;
$$;

revoke execute on function public.save_recipe(bigint, text, smallint, public.portion_unit, jsonb)
  from public, anon;
grant execute on function public.save_recipe(bigint, text, smallint, public.portion_unit, jsonb)
  to authenticated;

-- An entry names a library food, a food of one's own or a recipe.
alter table public.meal_entries
  add column recipe_id bigint references public.recipes (id),
  drop constraint meal_entries_one_food,
  add constraint meal_entries_one_food
    check (num_nonnulls(food_id, custom_food_id, recipe_id) = 1);

create index meal_entries_recipe_id_idx on public.meal_entries (recipe_id);

grant insert (recipe_id) on public.meal_entries to authenticated;

alter table public.removed_meal_entries
  add column recipe_id bigint references public.recipes (id);

-- Copies the values of the food an entry names, a recipe's summed from its ingredients. A food or
-- recipe of one's own must be the user's; another user's is reported as unknown, so that its id
-- reveals nothing.
create or replace function public.copy_food_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('benchbite.restoring_meal_entry', true) = 'on' then
    return new;
  end if;
  if new.recipe_id is not null then
    select v.kcal, v.protein_g, v.carbs_g, v.fat_g
    into new.kcal_per_100g, new.protein_per_100g, new.carbs_per_100g, new.fat_per_100g
    from public.recipes r
    join public.recipe_values v on v.recipe_id = r.id
    where r.id = new.recipe_id and r.user_id = new.user_id and r.archived_at is null;
    if not found then
      if exists (
        select 1 from public.recipes r where r.id = new.recipe_id and r.user_id = new.user_id
      ) then
        raise exception 'The recipe was deleted' using errcode = 'BB022';
      end if;
      raise exception 'Recipe % not found', new.recipe_id using errcode = '23503';
    end if;
    return new;
  end if;
  if new.custom_food_id is not null then
    select c.kcal, c.protein_g, c.carbs_g, c.fat_g
    into new.kcal_per_100g, new.protein_per_100g, new.carbs_per_100g, new.fat_per_100g
    from public.custom_foods c
    where c.id = new.custom_food_id and c.user_id = new.user_id and c.archived_at is null;
    if not found then
      if exists (
        select 1 from public.custom_foods c
        where c.id = new.custom_food_id and c.user_id = new.user_id
      ) then
        raise exception 'The food was deleted' using errcode = 'BB022';
      end if;
      raise exception 'Food % not found', new.custom_food_id using errcode = '23503';
    end if;
    return new;
  end if;
  select f.kcal, f.protein_g, f.carbs_g, f.fat_g
  into new.kcal_per_100g, new.protein_per_100g, new.carbs_per_100g, new.fat_per_100g
  from public.foods f
  where f.id = new.food_id and f.archived_at is null;
  if not found then
    if exists (select 1 from public.foods f where f.id = new.food_id) then
      raise exception 'The food is no longer in the library' using errcode = 'BB022';
    end if;
    -- The foreign key would only be checked after the copied values are found missing.
    raise exception 'Food % not found', new.food_id using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Unchanged apart from keeping and restoring the recipe.
create or replace function public.keep_removed_meal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;
  delete from public.removed_meal_entries r
  where r.user_id = old.user_id and r.removed_at < now() - interval '1 hour';
  insert into public.removed_meal_entries (
    id, user_id, day, meal, food_id, custom_food_id, recipe_id, grams, portion_unit,
    portion_count, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  values (
    old.id, old.user_id, old.day, old.meal, old.food_id, old.custom_food_id, old.recipe_id,
    old.grams, old.portion_unit, old.portion_count, old.kcal_per_100g, old.protein_per_100g,
    old.carbs_per_100g, old.fat_per_100g, old.created_at
  )
  on conflict (id) do nothing;
  return null;
end;
$$;

create or replace function public.restore_meal_entry(entry_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  entry public.removed_meal_entries;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.removed_meal_entries r
  where r.id = entry_id and r.user_id = caller_id and r.removed_at >= now() - interval '1 hour'
  returning * into entry;
  if not found then
    raise exception 'The entry cannot be restored' using errcode = 'BB023';
  end if;

  perform set_config('benchbite.restoring_meal_entry', 'on', true);
  insert into public.meal_entries (
    id, user_id, day, meal, food_id, custom_food_id, recipe_id, grams, portion_unit,
    portion_count, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  overriding system value
  values (
    entry.id, entry.user_id, entry.day, entry.meal, entry.food_id, entry.custom_food_id,
    entry.recipe_id, entry.grams, entry.portion_unit, entry.portion_count, entry.kcal_per_100g,
    entry.protein_per_100g, entry.carbs_per_100g, entry.fat_per_100g, entry.created_at
  );
  perform set_config('benchbite.restoring_meal_entry', 'off', true);
end;
$$;

-- Recipes can be starred too.
alter table public.favourite_foods
  add column recipe_id bigint references public.recipes (id),
  drop constraint favourite_foods_one_food,
  add constraint favourite_foods_one_food
    check (num_nonnulls(food_id, custom_food_id, recipe_id) = 1),
  add constraint favourite_foods_unique_recipe unique (user_id, recipe_id);

create index favourite_foods_recipe_id_idx on public.favourite_foods (recipe_id);

grant insert (recipe_id) on public.favourite_foods to authenticated;

drop policy "Users star foods" on public.favourite_foods;
create policy "Users star foods"
  on public.favourite_foods for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      custom_food_id is null
      or exists (
        select 1 from public.custom_foods c
        where c.id = custom_food_id and c.user_id = (select auth.uid())
      )
    )
    and (
      recipe_id is null
      or exists (
        select 1 from public.recipes r
        where r.id = recipe_id and r.user_id = (select auth.uid())
      )
    )
  );

create or replace function public.check_favourite_food_limit()
returns trigger
language plpgsql
-- Calls lock_user_limits(), which callers may not execute.
security definer
set search_path = ''
as $$
begin
  perform public.lock_user_limits(new.user_id);
  if (
    select count(*)
    from public.favourite_foods fav
    left join public.foods f on f.id = fav.food_id
    left join public.custom_foods c on c.id = fav.custom_food_id
    left join public.recipes r on r.id = fav.recipe_id
    where fav.user_id = new.user_id
      and coalesce(f.archived_at, c.archived_at, r.archived_at) is null
  ) >= 500 then
    raise exception 'A user can have up to 500 favourite foods' using errcode = 'BB027';
  end if;
  return new;
end;
$$;

-- The lists gain a recipe_id, so their result types change.
drop function public.list_favourite_foods(text);
drop function public.frequent_foods(public.meal, text);
drop function public.loggable_foods(text);
drop function public.search_foods(text, text);

-- The foods the caller can log, now with their recipes, whose portion is one serving.
create function public.loggable_foods(language text)
returns table (
  food_id text,
  custom_food_id bigint,
  recipe_id bigint,
  name text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  portion_unit public.portion_unit,
  portion_grams numeric
)
language sql
stable
set search_path = ''
as $$
  select f.id, null::bigint, null::bigint, coalesce(own.name, en.name), f.kcal, f.protein_g,
    f.carbs_g, f.fat_g, p.unit, p.grams
  from public.foods f
  join public.food_names en on en.food_id = f.id and en.language = 'en'
  left join public.food_names own
    on own.food_id = f.id and own.language = loggable_foods.language
  join public.food_portions p on p.food_id = f.id and p.is_default
  where f.archived_at is null
  union all
  select null, c.id, null, c.name, c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.portion_unit,
    c.portion_grams
  from public.custom_foods c
  where c.user_id = (select auth.uid()) and c.archived_at is null
  union all
  select null, null, r.id, r.name, v.kcal, v.protein_g, v.carbs_g, v.fat_g, r.serving_unit,
    round(v.grams / r.servings, 1)
  from public.recipes r
  join public.recipe_values v on v.recipe_id = r.id
  where r.user_id = (select auth.uid()) and r.archived_at is null;
$$;

revoke execute on function public.loggable_foods(text) from public, anon;
grant execute on function public.loggable_foods(text) to authenticated;

-- Unchanged apart from recipes.
create function public.list_favourite_foods(language text)
returns table (
  food_id text,
  custom_food_id bigint,
  recipe_id bigint,
  name text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  portion_unit public.portion_unit,
  portion_grams numeric
)
language sql
stable
set search_path = ''
as $$
  select l.food_id, l.custom_food_id, l.recipe_id, l.name, l.kcal, l.protein_g, l.carbs_g,
    l.fat_g, l.portion_unit, l.portion_grams
  from public.favourite_foods fav
  join public.loggable_foods(list_favourite_foods.language) l
    on l.food_id = fav.food_id
      or l.custom_food_id = fav.custom_food_id
      or l.recipe_id = fav.recipe_id
  order by fav.created_at desc, fav.id desc;
$$;

revoke execute on function public.list_favourite_foods(text) from public, anon;
grant execute on function public.list_favourite_foods(text) to authenticated;

-- Unchanged apart from recipes.
create function public.frequent_foods(for_meal public.meal, language text)
returns table (
  food_id text,
  custom_food_id bigint,
  recipe_id bigint,
  name text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  times integer,
  grams numeric,
  portion_unit public.portion_unit,
  portion_count numeric
)
language sql
stable
set search_path = ''
as $$
  with recent as (
    select e.food_id, e.custom_food_id, e.recipe_id, e.grams, e.portion_unit, e.portion_count,
      count(*) over (partition by e.food_id, e.custom_food_id, e.recipe_id) as times,
      row_number() over (
        partition by e.food_id, e.custom_food_id, e.recipe_id
        order by e.day desc, e.created_at desc, e.id desc
      ) as newest
    from public.meal_entries e
    where e.meal = frequent_foods.for_meal
      and e.day >= current_date - 90
  ),
  latest as (
    select * from recent where newest = 1
  )
  select f.food_id, f.custom_food_id, f.recipe_id, f.name, f.kcal, f.protein_g, f.carbs_g,
    f.fat_g, l.times::integer, l.grams, l.portion_unit, l.portion_count
  from latest l
  join public.loggable_foods(frequent_foods.language) f
    on f.food_id = l.food_id or f.custom_food_id = l.custom_food_id or f.recipe_id = l.recipe_id
  order by l.times desc, f.name
  limit 10;
$$;

revoke execute on function public.frequent_foods(public.meal, text) from public, anon;
grant execute on function public.frequent_foods(public.meal, text) to authenticated;

-- Unchanged apart from copying the recipe and leaving out deleted ones.
create or replace function public.copy_meal_entries(
  entry_ids bigint[],
  to_day date,
  to_meal public.meal
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  added integer;
begin
  -- More than a meal holds, as the entries of one day are limited too.
  if cardinality(entry_ids) > 100 then
    raise exception 'Up to 100 entries at a time' using errcode = '22023';
  end if;
  insert into public.meal_entries (day, meal, food_id, custom_food_id, recipe_id, grams,
    portion_unit, portion_count)
  select copy_meal_entries.to_day, copy_meal_entries.to_meal, e.food_id, e.custom_food_id,
    e.recipe_id, e.grams, e.portion_unit, e.portion_count
  from public.meal_entries e
  left join public.foods f on f.id = e.food_id
  left join public.custom_foods c on c.id = e.custom_food_id
  left join public.recipes r on r.id = e.recipe_id
  where e.user_id = (select auth.uid())
    and e.id = any (copy_meal_entries.entry_ids)
    and coalesce(f.archived_at, c.archived_at, r.archived_at) is null
  order by e.created_at, e.id;
  get diagnostics added = row_count;
  return added;
end;
$$;

-- Search finds the caller's recipes too, by their name, ranked alike (ADR 0035). On a tie, one's
-- own recipes and foods come before the library's.
create function public.search_foods(query text, language text)
returns table (
  food_id text,
  custom_food_id bigint,
  recipe_id bigint,
  name text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  -- The default portion, a recipe's serving, or none.
  portion_unit public.portion_unit,
  portion_grams numeric
)
language sql
stable
set search_path = ''
as $$
  with search as (
    select public.food_name_key(trim(search_foods.query)) as term
  ),
  -- The library's names in the user's language and in English, and the user's foods and recipes.
  names as (
    select n.food_id, null::bigint as custom_food_id, null::bigint as recipe_id,
      public.food_name_key(n.name) as name
    from public.food_names n
    where n.language in (search_foods.language, 'en')
    union all
    select null, c.id, null, public.food_name_key(c.name)
    from public.custom_foods c
    where c.user_id = (select auth.uid()) and c.archived_at is null
    union all
    select null, null, r.id, public.food_name_key(r.name)
    from public.recipes r
    where r.user_id = (select auth.uid()) and r.archived_at is null
  ),
  scored as (
    select
      x.food_id,
      x.custom_food_id,
      x.recipe_id,
      case
        -- The query is the name's first word, such as "Ei" in "Ei, roh".
        when x.name = s.term
          or starts_with(x.name, s.term || ' ')
          or starts_with(x.name, s.term || ',') then 4
        when starts_with(x.name, s.term) then 3
        when position(s.term in x.name) > 0 then 2
        -- A word of the name close to the query, for typos: below 1. Shorter queries have too
        -- few trigrams to compare.
        when length(s.term) >= 4 then extensions.strict_word_similarity(s.term, x.name)
        else 0
      end as score
    from names x
    cross join search s
    where length(s.term) between 2 and 50
  ),
  -- Each food once, by its best name. A typo counts from a similarity of 0.4.
  matches as (
    select distinct on (food_id, custom_food_id, recipe_id) food_id, custom_food_id, recipe_id,
      score
    from scored
    where score >= 0.4
    order by food_id, custom_food_id, recipe_id, score desc
  )
  select l.food_id, l.custom_food_id, l.recipe_id, l.name, l.kcal, l.protein_g, l.carbs_g,
    l.fat_g, l.portion_unit, l.portion_grams
  from matches m
  join public.loggable_foods(search_foods.language) l
    on l.food_id = m.food_id or l.custom_food_id = m.custom_food_id or l.recipe_id = m.recipe_id
  order by m.score desc, l.food_id is not null, length(l.name), l.food_id, l.custom_food_id,
    l.recipe_id
  limit 30;
$$;

revoke execute on function public.search_foods(text, text) from public, anon;
grant execute on function public.search_foods(text, text) to authenticated;
