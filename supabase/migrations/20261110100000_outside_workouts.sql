-- Workouts other apps and watches recorded in Apple Health or Health Connect (#468, ADR 0106): a run,
-- a ride or a class, shown next to Benchbite's own workouts. Only import_outside_workouts() writes
-- them; they count toward neither the streak nor the week's workouts.

-- The phone's store of health data, as the app names it (src/health/types.ts).
create type public.health_store as enum ('appleHealth', 'healthConnect');

create table public.outside_workouts (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The store it was read from: a phone with the other store keeps its own rows.
  store public.health_store not null,
  -- The store's own id of the workout.
  source_id text not null check (char_length(source_id) between 1 and 200),
  -- What was done, as the app names it from the store's type, such as running or cycling.
  activity text not null check (activity ~ '^[a-z][a-z_]{0,39}$'),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- The device's day it started on, as for logged workouts (ADR 0044).
  started_on date not null,
  -- As on workout_logs (ADR 0098).
  active_kcal smallint check (active_kcal between 0 and 5000),
  heart_rate_avg smallint check (heart_rate_avg between 25 and 250),
  -- The app or watch that recorded it, by its name, as health_source_name() keeps it.
  source text check (char_length(source) between 1 and 80),
  primary key (user_id, store, source_id),
  check (ended_at > started_at and ended_at - started_at <= interval '24 hours'),
  -- The device's day is within a day of the start's day in UTC.
  check (started_at >= (started_on::timestamp at time zone 'UTC') - interval '1 day'
    and started_at < (started_on::timestamp at time zone 'UTC') + interval '2 days')
);

create index outside_workouts_by_start on public.outside_workouts (user_id, started_at desc);

alter table public.outside_workouts enable row level security;

create policy "Users read their own outside workouts"
  on public.outside_workouts for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.outside_workouts from anon, authenticated;
grant select on public.outside_workouts to authenticated;

-- The outside workouts to show: one that covers more than half of a logged workout's time is that
-- workout, as a watch recorded it, and its heart rate and calories already show on the log. A view,
-- so that a workout logged after the import hides it too.
create view public.outside_workout_list
with (security_invoker = true)
as
select
  o.store,
  o.source_id,
  o.activity,
  o.started_at,
  o.ended_at,
  o.started_on,
  o.active_kcal,
  o.heart_rate_avg,
  o.source
from public.outside_workouts o
where not exists (
  select 1
  from public.workout_logs l
  where l.user_id = o.user_id
    and l.started_at < o.ended_at
    and l.finished_at > o.started_at
    and least(o.ended_at, l.finished_at) - greatest(o.started_at, l.started_at)
      > (l.finished_at - l.started_at) / 2
);

revoke all on public.outside_workout_list from anon, authenticated;
grant select on public.outside_workout_list to authenticated;

-- The most outside workouts a user keeps from the last 400 days, the most an import reaches back:
-- several a day, far more than anyone records, so that no one fills the table. Older ones stay
-- without counting, so a user of many years is never stopped.
create function public.outside_workout_limit()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3000;
$$;

revoke execute on function public.outside_workout_limit() from public, anon, authenticated;

-- Keeps the caller's workouts read from a store, given as [{"id", "activity", "startedAt",
-- "endedAt", "startedOn", "activeKcal"?, "heartRateAvg"?, "source"?}], at most 500: every workout the
-- store holds that started from `since` until before `until`. The app reads a longer time in parts.
-- The store is the truth for that time, so the caller's rows of the same store then that are not
-- given are taken out, as deleted or changed there. One phone per store is the truth: two with
-- their own Health Connect would take out each other's. An entry that is no workout is left out on
-- its own; figures out of range are kept as none. How many rows changed.
create function public.import_outside_workouts(
  workouts jsonb,
  health_store public.health_store,
  since timestamptz,
  until timestamptz,
  today date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  removed integer;
  changed integer;
begin
  if caller_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform public.assert_device_today(import_outside_workouts.today);
  if import_outside_workouts.health_store is null then
    raise exception 'The store is Apple Health or Health Connect' using errcode = '22023';
  end if;
  if import_outside_workouts.since is null
    or import_outside_workouts.until is null
    or import_outside_workouts.since < now() - interval '400 days'
    or import_outside_workouts.until > now() + interval '1 day'
    or import_outside_workouts.until <= import_outside_workouts.since then
    raise exception 'The time read is within the last 400 days' using errcode = '22023';
  end if;
  if import_outside_workouts.workouts is null
    or jsonb_typeof(import_outside_workouts.workouts) <> 'array'
    or jsonb_array_length(import_outside_workouts.workouts) > 500 then
    raise exception 'Workouts are a list of at most 500' using errcode = '22023';
  end if;
  -- One import of the caller's at a time, so that the count after it holds.
  perform public.lock_user_limits(caller_id);

  -- Materialized, so that its filter runs before any cast below.
  with given as materialized (
    select w
    from jsonb_array_elements(import_outside_workouts.workouts) as e(w)
    where jsonb_typeof(w -> 'id') = 'string'
      and char_length(w ->> 'id') between 1 and 200
      and w ->> 'activity' ~ '^[a-z][a-z_]{0,39}$'
      and jsonb_typeof(w -> 'startedAt') = 'string'
      and pg_input_is_valid(w ->> 'startedAt', 'timestamptz')
      and jsonb_typeof(w -> 'endedAt') = 'string'
      and pg_input_is_valid(w ->> 'endedAt', 'timestamptz')
      and w ->> 'startedOn' ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(w ->> 'startedOn', 'date')
  ), read as (
    select distinct on (r.source_id) r.*
    from (
      select
        w ->> 'id' as source_id,
        w ->> 'activity' as activity,
        (w ->> 'startedAt')::timestamptz as started_at,
        (w ->> 'endedAt')::timestamptz as ended_at,
        (w ->> 'startedOn')::date as started_on,
        case when jsonb_typeof(w -> 'activeKcal') = 'number'
          then round((w ->> 'activeKcal')::numeric) end as active_kcal,
        case when jsonb_typeof(w -> 'heartRateAvg') = 'number'
          then round((w ->> 'heartRateAvg')::numeric) end as heart_rate_avg,
        public.health_source_name(
          case when jsonb_typeof(w -> 'source') = 'string' then w ->> 'source' end
        ) as source
      from given
    ) r
    where r.started_at >= import_outside_workouts.since
      and r.started_at < import_outside_workouts.until
      -- outside_workouts' checks; they change together.
      and r.ended_at > r.started_at
      and r.ended_at - r.started_at <= interval '24 hours'
      and r.started_on between import_outside_workouts.today - 400 and import_outside_workouts.today
      and r.started_at >= (r.started_on::timestamp at time zone 'UTC') - interval '1 day'
      and r.started_at < (r.started_on::timestamp at time zone 'UTC') + interval '2 days'
    order by r.source_id
  ), gone as (
    delete from public.outside_workouts o
    where o.user_id = caller_id
      and o.store = import_outside_workouts.health_store
      and o.started_at >= import_outside_workouts.since
      and o.started_at < import_outside_workouts.until
      and not exists (select 1 from read r where r.source_id = o.source_id)
    returning 1
  ), kept as (
    insert into public.outside_workouts as o (
      user_id, store, source_id, activity, started_at, ended_at, started_on,
      active_kcal, heart_rate_avg, source
    )
    select
      caller_id,
      import_outside_workouts.health_store,
      r.source_id,
      r.activity,
      r.started_at,
      r.ended_at,
      r.started_on,
      case when r.active_kcal between 0 and 5000 then r.active_kcal::smallint end,
      case when r.heart_rate_avg between 25 and 250 then r.heart_rate_avg::smallint end,
      r.source
    from read r
    on conflict (user_id, store, source_id) do update
      set activity = excluded.activity,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        started_on = excluded.started_on,
        active_kcal = excluded.active_kcal,
        heart_rate_avg = excluded.heart_rate_avg,
        source = excluded.source
      where (o.activity, o.started_at, o.ended_at, o.started_on, o.active_kcal, o.heart_rate_avg,
          o.source)
        is distinct from (excluded.activity, excluded.started_at, excluded.ended_at,
          excluded.started_on, excluded.active_kcal, excluded.heart_rate_avg, excluded.source)
    returning 1
  )
  select (select count(*) from gone), (select count(*) from kept) into removed, changed;

  if (
    select count(*)
    from public.outside_workouts o
    where o.user_id = caller_id
      and o.started_at >= now() - interval '400 days'
  ) > public.outside_workout_limit() then
    raise exception 'Too many outside workouts' using errcode = '54000';
  end if;

  return removed + changed;
end;
$$;

revoke execute on function public.import_outside_workouts(
  jsonb, public.health_store, timestamptz, timestamptz, date
) from public, anon;
grant execute on function public.import_outside_workouts(
  jsonb, public.health_store, timestamptz, timestamptz, date
) to authenticated;
