-- What users eat, as entries per local day and meal (#200, ADR 0034). An entry names a food of the
-- library and an amount; the food's nutrients per 100 g are copied when it is logged, so that a
-- later change to the library never rewrites a past day.
--
-- Errors the app needs to tell apart have their own SQLSTATE codes:
--   BB020  the day is in the future or more than a week back
--   BB021  the day already has as many entries as it may have
--   BB022  the food is no longer in the library

-- Fixed meals, named in the app's translations.
create type public.meal as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.meal_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The user's local day, as the app sees it, so that a late dinner stays on its day.
  day date not null,
  meal public.meal not null,
  food_id text not null references public.foods (id),
  grams numeric(6, 1) not null check (grams > 0 and grams <= 5000),
  -- The portion that was picked, such as 2 slices, or null when grams were entered.
  portion_unit public.portion_unit,
  portion_count numeric(4, 1) check (portion_count > 0 and portion_count <= 100),
  check ((portion_unit is null) = (portion_count is null)),
  -- Per 100 g, copied from the food by copy_food_values(), which always overwrites the defaults.
  -- They only keep these columns optional for the app, which cannot send them.
  kcal_per_100g numeric(6, 1) not null default 0,
  protein_per_100g numeric(5, 2) not null default 0,
  carbs_per_100g numeric(5, 2) not null default 0,
  fat_per_100g numeric(5, 2) not null default 0,
  -- What the entry adds to the day.
  kcal numeric(7, 1) generated always as (round(grams * kcal_per_100g / 100, 1)) stored,
  protein_g numeric(6, 1) generated always as (round(grams * protein_per_100g / 100, 1)) stored,
  carbs_g numeric(6, 1) generated always as (round(grams * carbs_per_100g / 100, 1)) stored,
  fat_g numeric(6, 1) generated always as (round(grams * fat_per_100g / 100, 1)) stored,
  created_at timestamptz not null default now()
);

create index meal_entries_user_id_day_idx on public.meal_entries (user_id, day);
create index meal_entries_food_id_idx on public.meal_entries (food_id);

-- Users read, add, change and delete their own entries.
alter table public.meal_entries enable row level security;

create policy "Users read their own meal entries"
  on public.meal_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own meal entries"
  on public.meal_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own meal entries"
  on public.meal_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own meal entries"
  on public.meal_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The copied values are written only by copy_food_values(). An entry can move to another day or
-- meal and change its amount; another food is a new entry.
revoke all on public.meal_entries from anon;
revoke insert, update, truncate on public.meal_entries from authenticated;
grant insert (day, meal, food_id, grams, portion_unit, portion_count)
  on public.meal_entries to authenticated;
grant update (day, meal, grams, portion_unit, portion_count) on public.meal_entries to authenticated;

-- Copies the food's nutrients into a new entry.
create function public.copy_food_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

-- Keeps a day within its number of entries. Takes the user's limit lock first, so that inserts
-- sent at the same time cannot all pass the count.
create function public.check_meal_day_limit()
returns trigger
language plpgsql
-- Calls lock_user_limits(), which callers may not execute.
security definer
set search_path = ''
as $$
begin
  perform public.lock_user_limits(new.user_id);
  if (
    select count(*) from public.meal_entries e where e.user_id = new.user_id and e.day = new.day
  ) >= 100 then
    raise exception 'A day can have up to 100 entries' using errcode = 'BB021';
  end if;
  return new;
end;
$$;

-- Meals are logged for today and the week before it. The server's day may differ from the user's
-- by one either way, so it allows a day more on each side.
create function public.check_meal_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.day not between current_date - 8 and current_date + 1 then
    raise exception 'Meals can be logged for today and the week before' using errcode = 'BB020';
  end if;
  return new;
end;
$$;

revoke execute on function
  public.copy_food_values(),
  public.check_meal_day_limit(),
  public.check_meal_day()
from public, anon, authenticated;

create trigger meal_entries_copy_food_values
  before insert on public.meal_entries
  for each row execute function public.copy_food_values();

create trigger meal_entries_check_meal_day_limit
  before insert on public.meal_entries
  for each row execute function public.check_meal_day_limit();

create trigger meal_entries_check_meal_day
  before insert or update of day on public.meal_entries
  for each row execute function public.check_meal_day();
