-- Weights taken from Apple Health or Health Connect (#22, ADR 0100): a weight entry names the app or
-- scale it came from, and a weight entered in Benchbite wins over one from the store on its day.

-- The app or scale a weight came from; none for one entered in Benchbite.
alter table public.weight_entries
  add column source text check (length(source) between 1 and 80);

grant select (source) on public.weight_entries to authenticated;

-- A weight entered in Benchbite is the user's own again, on a day the store had filled.
create or replace function public.log_weight(weight_kg numeric, today date)
returns void
language plpgsql
-- Clears a day's source, which callers may not write.
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

-- Keeps the weights read from the store, one a day as `[{"day", "weightKg", "source"}]`, at most 60
-- of the last 60 days. A day with a weight entered in Benchbite keeps it; a weight no person has is
-- left out on its own. The targets follow when anything changed. How many days changed.
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

  with read as (
    select distinct on (day)
      (w ->> 'day')::date as day,
      round((w ->> 'weightKg')::numeric, 1) as weight_kg,
      left(nullif(regexp_replace(w ->> 'source', '^\s+|\s+$', '', 'g'), ''), 80) as source
    from jsonb_array_elements(import_weights.weights) w
    where jsonb_typeof(w -> 'weightKg') = 'number'
  ), kept as (
    insert into public.weight_entries as e (user_id, weight_kg, measured_on, source)
    select caller_id, r.weight_kg, r.day, coalesce(r.source, 'Health')
    from read r
    where r.day between import_weights.today - 60 and import_weights.today
      and r.weight_kg between 30 and 300
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
