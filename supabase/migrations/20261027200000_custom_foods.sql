-- Foods people add themselves, such as a packaged product, from its label (#203, ADR 0036). Only
-- their owner sees them. They are logged like library foods: an entry names one or the other and
-- copies its values (ADR 0034), and search finds both.
--
-- New error codes:
--   BB024  the user already has as many foods of their own as they may have
--   BB025  the food was deleted, which cannot be changed or undone

create table public.custom_foods (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  -- Per 100 g, as for library foods.
  kcal numeric(6, 1) not null check (kcal between 0 and 900),
  protein_g numeric(5, 2) not null check (protein_g between 0 and 100),
  carbs_g numeric(5, 2) not null check (carbs_g between 0 and 100),
  fat_g numeric(5, 2) not null check (fat_g between 0 and 100),
  check (protein_g + carbs_g + fat_g <= 100),
  -- One portion, such as 1 can = 330 g, or none.
  portion_unit public.portion_unit,
  portion_grams numeric(6, 1) check (portion_grams > 0 and portion_grams <= 5000),
  check ((portion_unit is null) = (portion_grams is null)),
  -- Set when the user deletes it. It stays for the entries that name it, but search and the
  -- app no longer offer it.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- A user's foods have different names, compared as search compares them (ADR 0035).
create unique index custom_foods_unique_name
  on public.custom_foods (user_id, public.food_name_key(name))
  where archived_at is null;

alter table public.custom_foods enable row level security;

create policy "Users read their own foods"
  on public.custom_foods for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own foods"
  on public.custom_foods for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users change their own foods"
  on public.custom_foods for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Deleting archives, so that past entries keep their food.
revoke all on public.custom_foods from anon;
revoke insert, update, delete, truncate on public.custom_foods from authenticated;
grant insert (name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams)
  on public.custom_foods to authenticated;
grant update (name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams, archived_at)
  on public.custom_foods to authenticated;

-- Up to 200 foods of one's own, and up to 1,000 counting deleted ones, so that deleting and
-- adding again cannot grow the table without end.
create function public.check_custom_food_limit()
returns trigger
language plpgsql
-- Calls lock_user_limits(), which callers may not execute.
security definer
set search_path = ''
as $$
begin
  perform public.lock_user_limits(new.user_id);
  if (
    select count(*) filter (where c.archived_at is null) >= 200 or count(*) >= 1000
    from public.custom_foods c
    where c.user_id = new.user_id
  ) then
    raise exception 'A user can have up to 200 foods of their own' using errcode = 'BB024';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_custom_food_limit() from public, anon, authenticated;

create trigger custom_foods_check_limit
  before insert on public.custom_foods
  for each row execute function public.check_custom_food_limit();

-- Deleting is for good: a deleted food is not changed or brought back, and the server sets the
-- time, whatever the app sends.
create function public.keep_custom_food_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null then
    raise exception 'The food was deleted' using errcode = 'BB025';
  end if;
  if new.archived_at is not null then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.keep_custom_food_deleted() from public, anon, authenticated;

create trigger custom_foods_keep_deleted
  before update on public.custom_foods
  for each row execute function public.keep_custom_food_deleted();

-- An entry names a library food or one of the user's own.
alter table public.meal_entries
  alter column food_id drop not null,
  add column custom_food_id bigint references public.custom_foods (id),
  add constraint meal_entries_one_food check (num_nonnulls(food_id, custom_food_id) = 1);

create index meal_entries_custom_food_id_idx on public.meal_entries (custom_food_id);

grant insert (custom_food_id) on public.meal_entries to authenticated;

alter table public.removed_meal_entries
  alter column food_id drop not null,
  add column custom_food_id bigint references public.custom_foods (id);

-- Copies the values of the food an entry names. A food of one's own must be the user's; another
-- user's is reported as unknown, so that its id reveals nothing.
create or replace function public.copy_food_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('benchbite.restoring_meal_entry', true) = 'on' then
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

-- Unchanged apart from keeping the food of one's own.
create or replace function public.keep_removed_meal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.removed_meal_entries r
  where r.user_id = old.user_id and r.removed_at < now() - interval '1 hour';
  insert into public.removed_meal_entries (
    id, user_id, day, meal, food_id, custom_food_id, grams, portion_unit, portion_count,
    kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  values (
    old.id, old.user_id, old.day, old.meal, old.food_id, old.custom_food_id, old.grams,
    old.portion_unit, old.portion_count, old.kcal_per_100g, old.protein_per_100g,
    old.carbs_per_100g, old.fat_per_100g, old.created_at
  )
  on conflict (id) do nothing;
  return null;
end;
$$;

-- Unchanged apart from restoring the food of one's own.
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
    id, user_id, day, meal, food_id, custom_food_id, grams, portion_unit, portion_count,
    kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  overriding system value
  values (
    entry.id, entry.user_id, entry.day, entry.meal, entry.food_id, entry.custom_food_id,
    entry.grams, entry.portion_unit, entry.portion_count, entry.kcal_per_100g,
    entry.protein_per_100g, entry.carbs_per_100g, entry.fat_per_100g, entry.created_at
  );
  perform set_config('benchbite.restoring_meal_entry', 'off', true);
end;
$$;

-- Search finds the user's own foods too, so its result gains their id; a library food has
-- food_id, a food of one's own custom_food_id. A food of one's own may have no portion.
drop function public.search_foods(text, text);

create function public.search_foods(query text, language text)
returns table (
  food_id text,
  custom_food_id bigint,
  name text,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  -- The food's default portion, or none.
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
  -- The library's names in the user's language and in English, and the user's own foods.
  names as (
    select n.food_id, null::bigint as custom_food_id, public.food_name_key(n.name) as name
    from public.food_names n
    where n.language in (search_foods.language, 'en')
    union all
    select null, c.id, public.food_name_key(c.name)
    from public.custom_foods c
    where c.user_id = (select auth.uid()) and c.archived_at is null
  ),
  scored as (
    select
      x.food_id,
      x.custom_food_id,
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
    select distinct on (food_id, custom_food_id) food_id, custom_food_id, score
    from scored
    where score >= 0.4
    order by food_id, custom_food_id, score desc
  ),
  found as (
    select
      f.id as food_id,
      null::bigint as custom_food_id,
      coalesce(own.name, en.name) as name,
      f.kcal,
      f.protein_g,
      f.carbs_g,
      f.fat_g,
      p.unit as portion_unit,
      p.grams as portion_grams,
      m.score
    from matches m
    join public.foods f on f.id = m.food_id and f.archived_at is null
    join public.food_names en on en.food_id = f.id and en.language = 'en'
    left join public.food_names own
      on own.food_id = f.id and own.language = search_foods.language
    join public.food_portions p on p.food_id = f.id and p.is_default
    union all
    select
      null, c.id, c.name, c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.portion_unit,
      c.portion_grams, m.score
    from matches m
    join public.custom_foods c on c.id = m.custom_food_id
  )
  -- On a tie, the user's own food first.
  select food_id, custom_food_id, name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams
  from found
  order by score desc, custom_food_id is null, length(name), food_id, custom_food_id
  limit 30;
$$;

revoke execute on function public.search_foods(text, text) from public, anon;
grant execute on function public.search_foods(text, text) to authenticated;
