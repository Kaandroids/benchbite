-- Each day keeps the targets it was measured against, so that a new goal or weight changes the
-- days from now on and leaves past days as they were (#239, ADR 0040). Entries keep their values
-- in the same way (ADR 0034).

-- The targets in use when a day's first entry was logged. Written only by the trigger below.
create table public.day_nutrition_targets (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  calories integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  primary key (user_id, day)
);

alter table public.day_nutrition_targets enable row level security;

create policy "Users read the targets of their days"
  on public.day_nutrition_targets for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.day_nutrition_targets from anon;
revoke insert, update, delete, truncate on public.day_nutrition_targets from authenticated;

-- Keeps the caller's targets in use for the day of a new entry, unless the day has some already:
-- they are written with its first entry only, so changing a past day later keeps them. Before the
-- onboarding is saved there are no targets to keep.
create function public.keep_day_nutrition_targets()
returns trigger
language plpgsql
-- Writes day_nutrition_targets, which callers may only read.
security definer
set search_path = ''
as $$
declare
  targets public.nutrition_targets := public.my_nutrition_targets();
begin
  if new.user_id is distinct from (select auth.uid()) or targets.calories is null then
    return null;
  end if;
  insert into public.day_nutrition_targets (user_id, day, calories, protein_g, carbs_g, fat_g)
  values (new.user_id, new.day, targets.calories, targets.protein_g, targets.carbs_g,
    targets.fat_g)
  on conflict (user_id, day) do nothing;
  return null;
end;
$$;

revoke execute on function public.keep_day_nutrition_targets() from public, anon, authenticated;

create trigger meal_entries_keep_day_targets
  after insert or update of day on public.meal_entries
  for each row execute function public.keep_day_nutrition_targets();

-- Days logged before this migration keep the targets in use now, the closest there is to the ones
-- they had. Each user's targets are read as that user, as my_nutrition_targets() reads them.
do $$
declare
  owner uuid;
  targets public.nutrition_targets;
begin
  for owner in select distinct e.user_id from public.meal_entries e loop
    perform set_config('request.jwt.claims', json_build_object('sub', owner)::text, true);
    targets := public.my_nutrition_targets();
    if targets.calories is not null then
      insert into public.day_nutrition_targets (user_id, day, calories, protein_g, carbs_g, fat_g)
      select distinct owner, e.day, targets.calories, targets.protein_g, targets.carbs_g,
        targets.fat_g
      from public.meal_entries e
      where e.user_id = owner
      on conflict (user_id, day) do nothing;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;
