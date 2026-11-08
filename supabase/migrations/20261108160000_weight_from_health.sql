-- Weights taken from Apple Health or Health Connect (#22, ADR 0100): a weight entry says whether it
-- came from the store, and from which app or scale; a weight entered in Benchbite wins on its day.

alter table public.weight_entries
  -- Whether the store gave this weight, which a later read may then replace.
  add column from_health boolean not null default false,
  -- The app or scale that measured it, when the store named one.
  add column source text check (length(source) between 1 and 80),
  add check (from_health or source is null);

-- Weights are written only by the functions below and complete_onboarding(), which keep the rule
-- above; a direct write would leave a day as the store's.
revoke insert, update on public.weight_entries from authenticated;
drop policy "Users add their own weight entries" on public.weight_entries;
drop policy "Users update their own weight entries" on public.weight_entries;

-- The name of the app or scale a health store's value came from, as it is kept: trimmed of any
-- whitespace and at most 80 characters; none when nothing is left.
create function public.health_source_name(source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      left(regexp_replace(health_source_name.source, '^\s+|\s+$', '', 'g'), 80), '\s+$', ''
    ),
    ''
  );
$$;

revoke execute on function public.health_source_name(text) from public, anon, authenticated;

-- Keeps what the phone's health store measured for one of the caller's workouts. The stores give
-- fractions, which are rounded here; the ranges are the columns' checks (20261108140000). A value
-- the read did not find keeps what was kept, and a read without a source keeps the one kept. Users
-- still cannot update their logs directly.
-- Its source is now named by health_source_name(), as a weight's is.
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


-- Saves the user's weight for today, or corrects a day of the last 60 that the store filled, as
-- when someone else stepped on a shared scale. Either way the day is the user's own afterwards, and
-- the store no longer changes it. The caller and the day are checked first, as it writes before
-- refresh_day_nutrition_targets() would check them.
drop function public.log_weight(numeric, date);
create function public.log_weight(weight_kg numeric, today date, day date default null)
returns void
language plpgsql
-- Writes weight entries, which callers may only read.
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  logged_on date := coalesce(log_weight.day, log_weight.today);
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(log_weight.today);
  if logged_on <> log_weight.today and not exists (
    select from public.weight_entries e
    where e.user_id = caller_id and e.measured_on = logged_on and e.from_health
      and logged_on between log_weight.today - 59 and log_weight.today
  ) then
    raise exception 'Only today, or a recent day the health store filled' using errcode = '22023';
  end if;
  insert into public.weight_entries (user_id, weight_kg, measured_on)
  values (caller_id, log_weight.weight_kg, logged_on)
  on conflict (user_id, measured_on) do update
    set weight_kg = excluded.weight_kg, from_health = false, source = null;
  perform public.refresh_day_nutrition_targets(log_weight.today);
end;
$$;

revoke execute on function public.log_weight(numeric, date, date) from public, anon;
grant execute on function public.log_weight(numeric, date, date) to authenticated;

-- Keeps the weights read from the store, `[{"day": "YYYY-MM-DD", "weightKg", "source"}]`, at most 60
-- of the last 60 days: a ceiling above the 30 days the app reads. Of a day given twice, the last
-- counts. A day with a weight entered in Benchbite keeps it. An entry whose day is not a date in
-- that form, whose weight is no number or one no person has (the column's check), or whose day is
-- outside the window, is left out on its own; a source that is no string is none. The targets
-- follow when anything changed. How many days changed.
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
  if import_weights.weights is null
    or jsonb_typeof(import_weights.weights) <> 'array'
    or jsonb_array_length(import_weights.weights) > 60 then
    raise exception 'Weights are a list of at most 60' using errcode = '22023';
  end if;

  with given as (
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

revoke execute on function public.import_weights(jsonb, date) from public, anon;
grant execute on function public.import_weights(jsonb, date) to authenticated;
