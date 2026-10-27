-- Undoing the removal of a meal entry (#202, ADR 0034). A removed entry is kept for an hour, out of
-- the app's reach, and restore_meal_entry() puts it back as it was: the same id, time and copied
-- values. Logging it anew would copy the food's current values, and a food taken out of the
-- library could not be logged at all.
--
-- A new error code:
--   BB023  the entry cannot be restored, as it is not the caller's or was removed too long ago

create table public.removed_meal_entries (
  id bigint primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  meal public.meal not null,
  food_id text not null references public.foods (id),
  grams numeric(6, 1) not null,
  portion_unit public.portion_unit,
  portion_count numeric(4, 1),
  kcal_per_100g numeric(6, 1) not null,
  protein_per_100g numeric(5, 2) not null,
  carbs_per_100g numeric(5, 2) not null,
  fat_per_100g numeric(5, 2) not null,
  created_at timestamptz not null,
  removed_at timestamptz not null default now()
);

create index removed_meal_entries_user_id_idx on public.removed_meal_entries (user_id);

-- Only the functions below use it.
alter table public.removed_meal_entries enable row level security;
revoke all on public.removed_meal_entries from anon, authenticated;

-- Keeps a removed entry for an hour, and drops the user's older ones.
create function public.keep_removed_meal_entry()
returns trigger
language plpgsql
-- Writes a table callers cannot reach.
security definer
set search_path = ''
as $$
begin
  delete from public.removed_meal_entries r
  where r.user_id = old.user_id and r.removed_at < now() - interval '1 hour';
  insert into public.removed_meal_entries (
    id, user_id, day, meal, food_id, grams, portion_unit, portion_count, kcal_per_100g,
    protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  values (
    old.id, old.user_id, old.day, old.meal, old.food_id, old.grams, old.portion_unit,
    old.portion_count, old.kcal_per_100g, old.protein_per_100g, old.carbs_per_100g,
    old.fat_per_100g, old.created_at
  )
  on conflict (id) do nothing;
  return null;
end;
$$;

create trigger meal_entries_keep_removed
  after delete on public.meal_entries
  for each row execute function public.keep_removed_meal_entry();

-- Unchanged apart from leaving a restored entry's values as they were.
create or replace function public.copy_food_values()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('benchbite.restoring_meal_entry', true) = 'on' then
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

-- Puts a removed entry of the caller back as it was. The day's checks still apply: it must be in
-- the week that can be logged, and within the day's number of entries.
create function public.restore_meal_entry(entry_id bigint)
returns void
language plpgsql
-- Reads the removed entries and writes the copied values, which callers cannot.
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

  -- Only for this insert, within this transaction.
  perform set_config('benchbite.restoring_meal_entry', 'on', true);
  insert into public.meal_entries (
    id, user_id, day, meal, food_id, grams, portion_unit, portion_count, kcal_per_100g,
    protein_per_100g, carbs_per_100g, fat_per_100g, created_at
  )
  overriding system value
  values (
    entry.id, entry.user_id, entry.day, entry.meal, entry.food_id, entry.grams,
    entry.portion_unit, entry.portion_count, entry.kcal_per_100g, entry.protein_per_100g,
    entry.carbs_per_100g, entry.fat_per_100g, entry.created_at
  );
  perform set_config('benchbite.restoring_meal_entry', 'off', true);
end;
$$;

revoke execute on function public.keep_removed_meal_entry() from public, anon, authenticated;
revoke execute on function public.restore_meal_entry(bigint) from public, anon;
grant execute on function public.restore_meal_entry(bigint) to authenticated;
