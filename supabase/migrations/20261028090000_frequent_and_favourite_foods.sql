-- Foods logged often and foods starred as favourites, to add again without searching, and a past
-- meal's entries to add again in one step (#205, ADR 0037).

-- The foods the caller can log, as search_foods() returns them: library foods still in the
-- library, named in the language with English as the fallback and with their default portion,
-- and the caller's own foods that are not deleted. The lists below join it, so that they agree on
-- names and on which foods can still be logged.
create function public.loggable_foods(language text)
returns table (
  food_id text,
  custom_food_id bigint,
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
  select f.id, null::bigint, coalesce(own.name, en.name), f.kcal, f.protein_g, f.carbs_g,
    f.fat_g, p.unit, p.grams
  from public.foods f
  join public.food_names en on en.food_id = f.id and en.language = 'en'
  left join public.food_names own
    on own.food_id = f.id and own.language = loggable_foods.language
  join public.food_portions p on p.food_id = f.id and p.is_default
  where f.archived_at is null
  union all
  select null, c.id, c.name, c.kcal, c.protein_g, c.carbs_g, c.fat_g, c.portion_unit,
    c.portion_grams
  from public.custom_foods c
  where c.user_id = (select auth.uid()) and c.archived_at is null;
$$;

revoke execute on function public.loggable_foods(text) from public, anon;
grant execute on function public.loggable_foods(text) to authenticated;

-- A food the user starred: a library food or one of their own, once each.
create table public.favourite_foods (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_id text references public.foods (id),
  custom_food_id bigint references public.custom_foods (id),
  created_at timestamptz not null default now(),
  constraint favourite_foods_one_food check (num_nonnulls(food_id, custom_food_id) = 1),
  constraint favourite_foods_unique_food unique (user_id, food_id),
  constraint favourite_foods_unique_custom_food unique (user_id, custom_food_id)
);

create index favourite_foods_food_id_idx on public.favourite_foods (food_id);
create index favourite_foods_custom_food_id_idx on public.favourite_foods (custom_food_id);

-- Users read, star and unstar their own favourites. A food of one's own can only be starred by
-- its owner.
alter table public.favourite_foods enable row level security;

create policy "Users read their own favourite foods"
  on public.favourite_foods for select to authenticated
  using ((select auth.uid()) = user_id);
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
  );
create policy "Users unstar foods"
  on public.favourite_foods for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.favourite_foods from anon;
revoke insert, update, truncate on public.favourite_foods from authenticated;
grant insert (food_id, custom_food_id) on public.favourite_foods to authenticated;

-- Up to 500 favourites per user. Favourites of foods that can no longer be logged are listed
-- nowhere and cannot be unstarred, so they do not count.
create function public.check_favourite_food_limit()
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
    where fav.user_id = new.user_id and coalesce(f.archived_at, c.archived_at) is null
  ) >= 500 then
    raise exception 'A user can have up to 500 favourite foods' using errcode = 'BB027';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_favourite_food_limit() from public, anon, authenticated;

create trigger favourite_foods_check_limit
  before insert on public.favourite_foods
  for each row execute function public.check_favourite_food_limit();

-- The caller's favourites that can still be logged, newest first, shaped as loggable_foods().
create function public.list_favourite_foods(language text)
returns table (
  food_id text,
  custom_food_id bigint,
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
  select l.food_id, l.custom_food_id, l.name, l.kcal, l.protein_g, l.carbs_g, l.fat_g,
    l.portion_unit, l.portion_grams
  from public.favourite_foods fav
  join public.loggable_foods(list_favourite_foods.language) l
    on l.food_id = fav.food_id or l.custom_food_id = fav.custom_food_id
  order by fav.created_at desc, fav.id desc;
$$;

revoke execute on function public.list_favourite_foods(text) from public, anon;
grant execute on function public.list_favourite_foods(text) to authenticated;

-- The 10 foods the caller logged most at a meal in the last 90 days, that can still be logged:
-- how often, and the amount they were logged with last, which the app adds again. Counted from
-- the entries, so there is nothing to keep in step.
create function public.frequent_foods(for_meal public.meal, language text)
returns table (
  food_id text,
  custom_food_id bigint,
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
    select e.food_id, e.custom_food_id, e.grams, e.portion_unit, e.portion_count,
      count(*) over (partition by e.food_id, e.custom_food_id) as times,
      row_number() over (
        partition by e.food_id, e.custom_food_id order by e.day desc, e.created_at desc, e.id desc
      ) as newest
    from public.meal_entries e
    where e.meal = frequent_foods.for_meal
      and e.day >= current_date - 90
  ),
  latest as (
    select * from recent where newest = 1
  )
  select f.food_id, f.custom_food_id, f.name, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
    l.times::integer, l.grams, l.portion_unit, l.portion_count
  from latest l
  join public.loggable_foods(frequent_foods.language) f
    on f.food_id = l.food_id or f.custom_food_id = l.custom_food_id
  order by l.times desc, f.name
  limit 10;
$$;

revoke execute on function public.frequent_foods(public.meal, text) from public, anon;
grant execute on function public.frequent_foods(public.meal, text) to authenticated;

-- Adds copies of the caller's entries to a meal of a day, in one step, with the same amounts and
-- the foods' current values, such as the foods picked from a past meal. Entries of others and
-- foods that can no longer be logged are left out. Returns how many were added. The day check
-- (BB020) applies to the new day.
create function public.copy_meal_entries(entry_ids bigint[], to_day date, to_meal public.meal)
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
  insert into public.meal_entries (day, meal, food_id, custom_food_id, grams, portion_unit,
    portion_count)
  select copy_meal_entries.to_day, copy_meal_entries.to_meal, e.food_id, e.custom_food_id,
    e.grams, e.portion_unit, e.portion_count
  from public.meal_entries e
  left join public.foods f on f.id = e.food_id
  left join public.custom_foods c on c.id = e.custom_food_id
  where e.user_id = (select auth.uid())
    and e.id = any (copy_meal_entries.entry_ids)
    and coalesce(f.archived_at, c.archived_at) is null
  order by e.created_at, e.id;
  get diagnostics added = row_count;
  return added;
end;
$$;

revoke execute on function public.copy_meal_entries(bigint[], date, public.meal)
  from public, anon;
grant execute on function public.copy_meal_entries(bigint[], date, public.meal)
  to authenticated;
