-- Food names are unique within their language (#212), so that search never shows two foods with
-- the same name. The same name in another language is fine.

-- A name as search and the uniqueness of names compare it: in lower case, with Turkish İ and ı
-- folded to i first. lower() follows the database's collation, which would turn İ into i with a
-- combining dot and keep ı, so "inc" would not find "İncir".
create function public.food_name_key(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(name, 'İı', 'ii'));
$$;

-- Search calls it with the caller's rights.
revoke execute on function public.food_name_key(text) from public, anon;
grant execute on function public.food_name_key(text) to authenticated;

create unique index food_names_unique_per_language
  on public.food_names (language, public.food_name_key(name));

-- Unchanged apart from comparing names with food_name_key().
create or replace function public.search_foods(query text, language text)
returns table (
  food_id text,
  name text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  -- The food's default portion.
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
  scored as (
    select
      n.food_id,
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
    from public.food_names n
    cross join search s
    cross join lateral (select public.food_name_key(n.name) as name) x
    where length(s.term) between 2 and 50
      and n.language in (search_foods.language, 'en')
  ),
  -- Each food once, by its best name. A typo counts from a similarity of 0.4.
  matches as (
    select distinct on (food_id) food_id, score
    from scored
    where score >= 0.4
    order by food_id, score desc
  )
  select
    f.id,
    coalesce(own.name, en.name),
    f.kcal,
    f.protein_g,
    f.carbs_g,
    f.fat_g,
    p.unit,
    p.grams
  from matches m
  join public.foods f on f.id = m.food_id and f.archived_at is null
  join public.food_names en on en.food_id = f.id and en.language = 'en'
  left join public.food_names own on own.food_id = f.id and own.language = search_foods.language
  join public.food_portions p on p.food_id = f.id and p.is_default
  order by m.score desc, length(coalesce(own.name, en.name)), f.id
  limit 30;
$$;
