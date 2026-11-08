-- Weights taken from Apple Health or Health Connect (#22, ADR 0100): a weight entry names the app or
-- scale it came from, and a weight entered in Benchbite wins over one from the store on its day.

-- The app or scale a weight came from; none for one entered in Benchbite.
alter table public.weight_entries
  add column source text check (length(source) between 1 and 80);

-- Weights are written only by the functions below and complete_onboarding(), which keep the rule
-- above; a direct write would leave a day's source as it was.
revoke insert, update on public.weight_entries from authenticated;
drop policy "Users add their own weight entries" on public.weight_entries;
drop policy "Users update their own weight entries" on public.weight_entries;

-- The name of the app or scale a health store's value came from, as it is kept: a string trimmed
-- of any whitespace and cut to 80 characters; none for anything else.
create function public.health_source_name(source jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(health_source_name.source) = 'string' then
    left(nullif(regexp_replace(health_source_name.source #>> '{}', '^\s+|\s+$', '', 'g'), ''), 80)
  end;
$$;

create function public.health_source_name(source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.health_source_name(to_jsonb(health_source_name.source));
$$;

-- set_workout_health() names its source the same way.
create or replace function public.set_workout_health(
  log_id bigint,
  heart_rate_avg numeric default null,
  heart_rate_max numeric default null,
  active_kcal numeric default null,
  source text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  average smallint;
  highest smallint;
  kcal integer;
  named text := public.health_source_name(set_workout_health.source);
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- A value no person can have is none, also one too large for its column.
  if set_workout_health.heart_rate_avg between 25 and 250 then
    average := round(set_workout_health.heart_rate_avg);
  end if;
  if set_workout_health.heart_rate_max between 25 and 250 then
    highest := round(set_workout_health.heart_rate_max);
  end if;
  if set_workout_health.active_kcal between 0 and 5000 then
    kcal := round(set_workout_health.active_kcal);
  end if;

  if not exists (
    select from public.workout_logs l
    where l.id = set_workout_health.log_id and l.user_id = caller_id
  ) then
    raise exception 'Workout log not found' using errcode = 'BB013';
  end if;
  if average is null or highest is null then
    return false;
  end if;

  update public.workout_logs l
  set heart_rate_avg = least(average, highest),
    heart_rate_max = highest,
    active_kcal = coalesce(kcal, l.active_kcal),
    health_source = coalesce(named, l.health_source)
  where l.id = set_workout_health.log_id and l.user_id = caller_id
    and (l.heart_rate_avg, l.heart_rate_max, l.active_kcal, l.health_source)
      is distinct from (least(average, highest), highest, coalesce(kcal, l.active_kcal),
        coalesce(named, l.health_source));
  return found;
end;
$$;


-- A weight entered in Benchbite is the user's own again, on a day the store had filled.
create or replace function public.log_weight(weight_kg numeric, today date)
returns void
language plpgsql
-- Writes weight entries, which callers may only read.
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(log_weight.today);
  insert into public.weight_entries (user_id, weight_kg, measured_on)
  values ((select auth.uid()), log_weight.weight_kg, log_weight.today)
  on conflict (user_id, measured_on) do update
    set weight_kg = excluded.weight_kg, source = null;
  perform public.refresh_day_nutrition_targets(log_weight.today);
end;
$$;

-- Keeps the weights read from the store, `[{"day", "weightKg", "source"}]`, at most 60 of the last
-- 60 days: a ceiling above the 30 days the app reads. Of a day given twice, the last one counts. A
-- day with a weight entered in Benchbite keeps it. An entry whose day is not a date, whose weight is
-- no number or one no person has (the column's check), or whose day is outside the window, is left
-- out on its own. The targets follow when anything changed. How many days changed.
create function public.import_weights(weights jsonb, today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  changed integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(import_weights.today);
  if jsonb_typeof(import_weights.weights) <> 'array'
    or jsonb_array_length(import_weights.weights) > 60 then
    raise exception 'Weights are a list of at most 60' using errcode = '22023';
  end if;

  with given as (
    select w, place
    from jsonb_array_elements(import_weights.weights) with ordinality as e(w, place)
    where jsonb_typeof(w -> 'weightKg') = 'number'
      and pg_input_is_valid(w ->> 'day', 'date')
  ), read as (
    select distinct on (day) day, weight_kg, source
    from (
      select
        (w ->> 'day')::date as day,
        round((w ->> 'weightKg')::numeric, 1) as weight_kg,
        public.health_source_name(w -> 'source') as source,
        place
      from given
    ) r
    where day between import_weights.today - 59 and import_weights.today
      and weight_kg between 30 and 300
    order by day, place desc
  ), kept as (
    insert into public.weight_entries as e (user_id, weight_kg, measured_on, source)
    select caller_id, r.weight_kg, r.day, coalesce(r.source, 'Health')
    from read r
    on conflict (user_id, measured_on) do update
      set weight_kg = excluded.weight_kg, source = excluded.source
      where e.source is not null
        and (e.weight_kg, e.source) is distinct from (excluded.weight_kg, excluded.source)
    returning 1
  )
  select count(*) into changed from kept;

  if changed > 0 then
    perform public.refresh_day_nutrition_targets(import_weights.today);
  end if;
  return changed;
end;
$$;

revoke execute on function public.import_weights(jsonb, date) from public, anon;
grant execute on function public.import_weights(jsonb, date) to authenticated;
revoke execute on function public.health_source_name(jsonb), public.health_source_name(text)
  from public, anon;
