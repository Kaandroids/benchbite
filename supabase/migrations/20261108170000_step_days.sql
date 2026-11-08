-- The day's steps from Apple Health or Health Connect (#469, ADR 0103): one total a day, as the store
-- counted it, for Today, Progress and Bite. Only import_steps() writes them.

create table public.step_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  steps integer not null check (steps between 0 and 200000),
  primary key (user_id, day)
);

alter table public.step_days enable row level security;

create policy "Users read their own step days"
  on public.step_days for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.step_days from anon, authenticated;
grant select on public.step_days to authenticated;

-- Keeps the steps read from the phone's health store for the caller, one total a day, each a day of
-- the last year; of a day given twice, the last counts. A day the store counts again, as today does
-- while the user walks, takes the new total. Entries that are no day or no count are left out on
-- their own. How many days changed.
create function public.import_steps(days jsonb, today date)
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
  perform public.assert_device_today(import_steps.today);
  if import_steps.days is null
    or jsonb_typeof(import_steps.days) <> 'array'
    or jsonb_array_length(import_steps.days) > 366 then
    raise exception 'Steps are a list of at most 366' using errcode = '22023';
  end if;

  with given as (
    select s, place
    from jsonb_array_elements(import_steps.days) with ordinality as e(s, place)
    where jsonb_typeof(s -> 'steps') = 'number'
      and s ->> 'day' ~ '^\d{4}-\d{2}-\d{2}$'
      and pg_input_is_valid(s ->> 'day', 'date')
  ), read as (
    select distinct on (r.day) r.day, r.count
    from (
      select (s ->> 'day')::date as day, round((s ->> 'steps')::numeric) as count, place
      from given
    ) r
    where r.day between import_steps.today - 365 and import_steps.today
      and r.count between 0 and 200000
    order by r.day, r.place desc
  ), kept as (
    insert into public.step_days as d (user_id, day, steps)
    select caller_id, r.day, r.count::integer
    from read r
    on conflict (user_id, day) do update
      set steps = excluded.steps
      where d.steps <> excluded.steps
    returning 1
  )
  select count(*) into changed from kept;

  return changed;
end;
$$;

revoke execute on function public.import_steps(jsonb, date) from public, anon;
grant execute on function public.import_steps(jsonb, date) to authenticated;
