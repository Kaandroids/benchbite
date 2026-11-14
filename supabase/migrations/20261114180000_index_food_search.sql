-- Food search through a trigram index (#545): the library's names keep their search key in a
-- column, indexed with pg_trgm, and search_foods() looks only at the names the index finds, rather
-- than working the key and the similarity out for every name on each search. The scores and the
-- results are unchanged.

-- food_name_key() of the name, as every search compares it.
alter table public.food_names
  add column name_key text generated always as (public.food_name_key(name)) stored;

create index food_names_name_key_trgm
  on public.food_names using gin (name_key extensions.gin_trgm_ops);

-- As before (20261028170000_search_without_recipes.sql), and only over the names the index finds.
create or replace function public.search_foods(
  query text,
  language text,
  recipes boolean default true
)
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
-- The share of a name's words a typo must match, as `<<%` reads it: the 0.4 the scores keep.
set pg_trgm.strict_word_similarity_threshold = 0.4
as $$
  with search as (
    select public.food_name_key(trim(search_foods.query)) as term
  ),
  -- The term as a pattern of itself, for the trigram index to find the names that hold it.
  pattern as (
    select '%' || replace(replace(replace(s.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      as contains
    from search s
  ),
  -- The library's names in the user's language and in English, and the user's foods and recipes.
  names as (
    select n.food_id, null::bigint as custom_food_id, null::bigint as recipe_id, n.name_key as name
    from public.food_names n
    cross join search s
    cross join pattern p
    where n.language in (search_foods.language, 'en')
      -- Only the names a score below can count, found by the index: those that hold the term,
      -- and for a typo those with a word close to it. The scores decide among them as before.
      and (
        n.name_key like p.contains
        or (length(s.term) >= 4 and s.term operator(extensions.<<%) n.name_key)
      )
    union all
    select null, c.id, null, public.food_name_key(c.name)
    from public.custom_foods c
    where c.user_id = (select auth.uid()) and c.archived_at is null
    union all
    select null, null, r.id, public.food_name_key(r.name)
    from public.recipes r
    where search_foods.recipes and r.user_id = (select auth.uid()) and r.archived_at is null
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
  ),
  -- Joined by kind with equal ids, so that only the matches are built: a recipe's values are
  -- summed for the recipes found, not for all of them.
  found as (
    select f.id as food_id, null::bigint as custom_food_id, null::bigint as recipe_id,
      coalesce(own.name, en.name) as name, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
      p.unit as portion_unit, p.grams as portion_grams, m.score
    from matches m
    join public.foods f on f.id = m.food_id and f.archived_at is null
    join public.food_names en on en.food_id = f.id and en.language = 'en'
    left join public.food_names own
      on own.food_id = f.id and own.language = search_foods.language
    join public.food_portions p on p.food_id = f.id and p.is_default
    union all
    select null, c.id, null, c.name, c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.portion_unit,
      c.portion_grams, m.score
    from matches m
    join public.custom_foods c on c.id = m.custom_food_id
    union all
    select null, null, r.id, r.name, v.kcal, v.protein_g, v.carbs_g, v.fat_g, r.serving_unit,
      v.serving_grams, m.score
    from matches m
    join public.recipes r on r.id = m.recipe_id
    join public.recipe_values v on v.recipe_id = r.id
  )
  select food_id, custom_food_id, recipe_id, name, kcal, protein_g, carbs_g, fat_g, portion_unit,
    portion_grams
  from found
  order by score desc, food_id is not null, length(name), food_id, custom_food_id, recipe_id
  limit 30;
$$;
