-- What clients may call and touch beyond row level security: internal helpers are no API
-- endpoints, and anon has no access to the workout log tables.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select ok(
  not bool_or(has_function_privilege(role, p.oid, 'execute')),
  'Helpers called only by owner-rights functions are closed to clients: ' || p.proname
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) roles (role)
where p.proname in (
  'metrics_valid', 'custom_exercise_fields', 'target_suits', 'exercise_seconds', 'set_suits',
  'sets_of'
)
group by p.proname
order by p.proname;

select ok(
  not has_function_privilege('anon', 'public.one_rep_max(numeric, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.one_rep_max(numeric, integer)', 'execute'),
  'Helpers that caller-rights functions use are for signed-in users only'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name in ('workout_logs', 'logged_sets', 'workout_log_summaries')
  ),
  'Anon has no access to the workout log tables'
);

select * from finish();
rollback;
