-- What clients may call and touch beyond row level security: every table has row level security
-- and every view reads with the caller's rights, internal helpers are no API endpoints, and anon
-- has no access to the workout log tables or the moves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- A new table or view without them would be open to every client.
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'Every table has row level security'
);
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any(c.reloptions), false) $$,
  'Every view reads with the rights of its caller'
);

select ok(
  not bool_or(has_function_privilege(role, p.oid, 'execute')),
  'Helpers called only by owner-rights functions are closed to clients: ' || p.proname
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join (values ('anon'), ('authenticated')) roles (role)
where p.proname in (
  'metrics_valid', 'custom_exercise_fields', 'target_suits', 'exercise_seconds', 'set_suits',
  'sets_of', 'custom_exercise_limit', 'lock_user_limits', 'move_fits', 'save_move',
  'drop_stale_moves', 'insert_workout_exercises'
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
      and table_name in ('workout_logs', 'logged_sets', 'workout_log_summaries', 'workout_moves')
  ),
  'Anon has no access to the workout log tables or the moves'
);

select * from finish();
rollback;
