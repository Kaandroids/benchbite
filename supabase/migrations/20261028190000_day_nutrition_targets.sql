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
-- they are written with its first entry, so logging to a past day later keeps them. Until the day
-- is over they follow the targets in use, through refresh_day_nutrition_targets(). Before the
-- onboarding is saved there are no targets to keep.
create function public.keep_day_nutrition_targets()
returns trigger
language plpgsql
-- Writes day_nutrition_targets, which callers may only read.
security definer
set search_path = ''
as $$
declare
  targets public.nutrition_targets;
begin
  if new.user_id is distinct from (select auth.uid()) then
    return null;
  end if;
  -- Only a day's first entry works the targets out, so that copying a meal does it once.
  if exists (
    select 1 from public.day_nutrition_targets d
    where d.user_id = new.user_id and d.day = new.day
  ) then
    return null;
  end if;
  targets := public.my_nutrition_targets();
  if targets.calories is null then
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

-- Writes the caller's targets in use over the days they have kept from `from_day` on, the device's
-- today: a day still under way, or logged ahead, follows a new goal, own targets or weight, as it
-- shows them while it lasts. Days before it keep theirs. The device decides which day is today
-- (ADR 0034), so it passes it; the server's date may be a day apart, so no earlier day is taken.
create function public.refresh_day_nutrition_targets(from_day date)
returns void
language plpgsql
-- Writes day_nutrition_targets, which callers may only read.
security definer
set search_path = ''
as $$
declare
  targets public.nutrition_targets := public.my_nutrition_targets();
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if refresh_day_nutrition_targets.from_day < current_date - 1 then
    raise exception 'Only today and later days follow the targets in use' using errcode = '22023';
  end if;
  if targets.calories is null then
    return;
  end if;
  update public.day_nutrition_targets d
  set calories = targets.calories,
    protein_g = targets.protein_g,
    carbs_g = targets.carbs_g,
    fat_g = targets.fat_g
  where d.user_id = (select auth.uid()) and d.day >= refresh_day_nutrition_targets.from_day;
end;
$$;

revoke execute on function public.refresh_day_nutrition_targets(date) from public, anon;
grant execute on function public.refresh_day_nutrition_targets(date) to authenticated;

-- The targets a day is measured against: from `today` on, the device's today, the ones in use; a
-- past day the ones it kept, or, without any as nothing was logged on it, the ones in use.
create function public.targets_of_day(on_day date, today date)
returns public.nutrition_targets
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select row(d.calories, d.protein_g, d.carbs_g, d.fat_g)::public.nutrition_targets
      from public.day_nutrition_targets d
      where d.user_id = (select auth.uid())
        and d.day = targets_of_day.on_day
        and targets_of_day.on_day < targets_of_day.today
    ),
    public.my_nutrition_targets()
  );
$$;

revoke execute on function public.targets_of_day(date, date) from public, anon;
grant execute on function public.targets_of_day(date, date) to authenticated;

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
