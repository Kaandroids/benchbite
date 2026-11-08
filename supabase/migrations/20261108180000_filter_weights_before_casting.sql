-- Recreates import_weights() (20261108160000) with its filter run before the casts.

create or replace function public.import_weights(weights jsonb, today date)
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
  if import_weights.weights is null
    or jsonb_typeof(import_weights.weights) <> 'array'
    or jsonb_array_length(import_weights.weights) > 60 then
    raise exception 'Weights are a list of at most 60' using errcode = '22023';
  end if;

  -- Materialized, so that its filter runs before any cast below; inlined, the planner may cast an
  -- entry the filter would leave out, and the whole call fails.
  with given as materialized (
    select w, place
    from jsonb_array_elements(import_weights.weights) with ordinality as e(w, place)
    where jsonb_typeof(w -> 'weightKg') = 'number'
      and w ->> 'day' ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(w ->> 'day', 'date')
  ), read as (
    select distinct on (day) day, weight_kg, source
    from (
      select
        (w ->> 'day')::date as day,
        round((w ->> 'weightKg')::numeric, 1) as weight_kg,
        public.health_source_name(
          case when jsonb_typeof(w -> 'source') = 'string' then w ->> 'source' end
        ) as source,
        place
      from given
    ) r
    where day between import_weights.today - 59 and import_weights.today
      and weight_kg between 30 and 300
    order by day, place desc
  ), kept as (
    insert into public.weight_entries as e (user_id, weight_kg, measured_on, from_health, source)
    select caller_id, r.weight_kg, r.day, true, r.source
    from read r
    on conflict (user_id, measured_on) do update
      set weight_kg = excluded.weight_kg, source = excluded.source
      where e.from_health
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
