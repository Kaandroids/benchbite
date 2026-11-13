-- The status of the removal of inactive guests that the Monitor workflow checks (ADR 0131, 0132):
-- healthy while no guest is overdue and the hourly job ran lately, and run only by the Monitor's
-- read-only role.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- The job's runs as this test sets them.
delete from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'remove-inactive-guests');

-- A run of the job that ended `ended` ago, which started a second before unless `started` is false.
create function pg_temp.ran(status text, ended interval, started boolean default true)
returns void language sql as $$
  -- With a run id of its own, as the sequence is pg_cron's.
  insert into cron.job_run_details (jobid, runid, status, start_time, end_time)
  select jobid, (select coalesce(max(runid), 0) + 1 from cron.job_run_details), status,
    case when started then now() - ended - interval '1 second' end, now() - ended
  from cron.job where jobname = 'remove-inactive-guests';
$$;

select is(
  (select row(overdue_guests, latest_run_status, healthy)::text
    from public.inactive_guest_removal_status()),
  row(0::bigint, null::text, false)::text,
  'A job that never ran is not healthy'
);

select pg_temp.ran('succeeded', interval '30 minutes');
select is(
  (select row(overdue_guests, latest_run_status, latest_run_minutes, healthy)::text
    from public.inactive_guest_removal_status()),
  row(0::bigint, 'succeeded', 30, true)::text,
  'It is healthy with no guest overdue and a run that succeeded lately'
);

select pg_temp.ran('failed', interval '5 minutes');
select is(
  (select row(latest_run_status, healthy)::text from public.inactive_guest_removal_status()),
  row('failed', false)::text,
  'Its latest run failing makes it unhealthy'
);

delete from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'remove-inactive-guests');
select pg_temp.ran('succeeded', interval '3 hours');
select is(
  (select healthy from public.inactive_guest_removal_status()), false,
  'So does no run in the last two hours'
);

-- A run pg_cron failed to start has no start time, and a later run still counts as the latest.
delete from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'remove-inactive-guests');
select pg_temp.ran('failed', interval '20 days', started => false);
select pg_temp.ran('succeeded', interval '10 minutes');
select is(
  (select row(latest_run_status, healthy)::text from public.inactive_guest_removal_status()),
  row('succeeded', true)::text,
  'A later run is the latest, though an earlier one has no start'
);

-- A guest past the period by more than a day, one past it by less, and an account.
select pg_temp.ran('succeeded', interval '10 minutes');
insert into auth.users (id, email, is_anonymous, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-00000000000a', null, true, now() - interval '92 days', now() - interval '92 days'),
  ('00000000-0000-0000-0000-00000000000b', null, true, now() - interval '90 days 12 hours', now() - interval '90 days 12 hours'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', false, now() - interval '200 days', now() - interval '200 days');
select is(
  (select row(overdue_guests, healthy)::text from public.inactive_guest_removal_status()),
  row(1::bigint, false)::text,
  'A guest overdue by more than a day makes it unhealthy; one the next run removes and accounts do not'
);
select ok(
  public.inactive_guest_removal_stalled(),
  'The scheduled job''s warning sees the same guest overdue'
);

-- Only the Monitor's read-only role runs it.
select ok(
  has_function_privilege('supabase_read_only_user', 'public.inactive_guest_removal_status()', 'execute'),
  'The read-only role may run it'
);
select ok(
  not has_function_privilege(role, 'public.inactive_guest_removal_status()', 'execute'),
  format('%s may not run it', role)
)
from unnest(array['anon', 'authenticated', 'service_role']) role;

-- The tests cannot take the role, so it is told by its rights to what the status calls.
select ok(
  has_function_privilege('supabase_read_only_user', function, 'execute'),
  format('The read-only role may run %s, which the status calls', function)
)
from unnest(array[
  'public.inactive_guests_since(timestamptz, uuid)', 'public.guest_inactivity_period()',
  'public.inactive_guest_overdue_before()'
]) function;

select ok(
  not has_function_privilege('authenticated', 'public.inactive_guests_since(timestamptz, uuid)', 'execute'),
  'Clients still may not list inactive guests'
);

select * from finish();
rollback;
