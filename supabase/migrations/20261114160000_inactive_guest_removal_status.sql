-- Where the removal of inactive guests stands (#535, ADR 0131), for the Monitor workflow (ADR 0067)
-- to check once a day: it only warns in the Postgres logs when it falls behind.

-- The time before which a guest's last activity makes them overdue: past the period by more than a
-- day, which the hourly job removes in time while it works. The scheduled job's warning and the Monitor's check
-- both read it, so that they agree.
create function public.inactive_guest_overdue_before()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now() - public.guest_inactivity_period() - interval '1 day';
$$;

-- As before (20261114130000_remove_inactive_guests.sql), by the cutoff above.
create or replace function public.inactive_guest_removal_stalled()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select from public.inactive_guests_since(public.inactive_guest_overdue_before())
  );
$$;

-- How many guests are past the period by more than a day, which the hourly job removes in time
-- while it works, and when and how its latest run ended. Healthy while none is overdue and the job
-- succeeded within the last two hours. Only counts, ages and the run's status are returned.
create function public.inactive_guest_removal_status()
returns table (
  overdue_guests bigint,
  latest_run_status text,
  latest_run_minutes integer,
  healthy boolean
)
language sql
stable
set search_path = ''
as $$
  with overdue as (
    select count(*) as guests
    from public.inactive_guests_since(public.inactive_guest_overdue_before())
  ),
  latest as (
    select d.status, d.end_time
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where j.jobname = 'remove-inactive-guests'
    -- By run id, never null, as pg_cron leaves the start of a run that failed to start empty.
    order by d.runid desc
    limit 1
  )
  select
    o.guests,
    l.status,
    floor(extract(epoch from now() - l.end_time) / 60)::integer,
    o.guests = 0
      and coalesce(l.status = 'succeeded' and l.end_time > now() - interval '2 hours', false)
  from overdue o
  left join latest l on true;
$$;

-- Only the Monitor's read-only role runs it, with the functions it calls (ADR 0132).
revoke execute on function public.inactive_guest_removal_status()
  from public, anon, authenticated, service_role;
grant execute on function public.inactive_guest_removal_status() to supabase_read_only_user;
grant execute on function public.inactive_guests_since(timestamptz, uuid) to supabase_read_only_user;
grant execute on function public.guest_inactivity_period() to supabase_read_only_user;
revoke execute on function public.inactive_guest_overdue_before()
  from public, anon, authenticated, service_role;
grant execute on function public.inactive_guest_overdue_before() to supabase_read_only_user;
