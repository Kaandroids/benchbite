-- Water drunk per day, against a daily goal (#206). Only a day's total is kept: the app adds and
-- removes glasses, and shows the total against the goal.

-- The daily goal in millilitres, 2 L unless the user sets another in the settings.
alter table public.profiles
  add column water_goal_ml integer not null default 2000
    check (water_goal_ml between 500 and 6000);

grant update (water_goal_ml) on public.profiles to authenticated;

create table public.water_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The user's local day, as for meals (ADR 0034).
  day date not null,
  ml integer not null check (ml between 0 and 10000),
  primary key (user_id, day)
);

-- Users read their own days. They change them only through add_water(), which adds to the total
-- in one step, so that two quick taps both count.
alter table public.water_days enable row level security;

create policy "Users read their own water"
  on public.water_days for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.water_days from anon;
revoke insert, update, delete, truncate on public.water_days from authenticated;

-- Water is logged for today and the week before it, as meals are, so the day check is shared and
-- named for both. The meal triggers follow the function, not its name.
alter function public.check_meal_day() rename to check_log_day;

create or replace function public.check_log_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.day not between current_date - 8 and current_date + 1 then
    raise exception 'Only today and the week before can be logged' using errcode = 'BB020';
  end if;
  return new;
end;
$$;

create trigger water_days_check_day
  before insert or update of day on public.water_days
  for each row execute function public.check_log_day();

-- Adds millilitres to a day of the caller, or takes them away with a negative amount, and gives
-- the new total. It never goes below nothing or above 10 L.
create function public.add_water(on_day date, amount_ml integer)
returns integer
language plpgsql
-- Writes water_days, which callers may only read.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  total integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if amount_ml not between -10000 and 10000 then
    raise exception 'Up to 10 L at a time' using errcode = '22003';
  end if;
  insert into public.water_days as w (user_id, day, ml)
  values (caller_id, on_day, least(10000, greatest(0, amount_ml)))
  on conflict (user_id, day) do update
    set ml = least(10000, greatest(0, w.ml + amount_ml))
  returning w.ml into total;
  return total;
end;
$$;

revoke execute on function public.add_water(date, integer) from public, anon;
grant execute on function public.add_water(date, integer) to authenticated;
