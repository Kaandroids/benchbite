-- What clients may call and touch beyond row level security: every table has row level security
-- and every view reads with the caller's rights, new objects are closed to clients until granted,
-- internal helpers are no API endpoints, and anon has no access to the workout log tables or the
-- moves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(65);

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

-- New objects are closed until a migration grants them (#529, ADR 0126).
select is_empty(
  $$ select d.defaclobjtype::text || ' to ' || coalesce(nullif(a.grantee::regrole::text, '-'), 'public')
     from pg_default_acl d
     join pg_namespace n on n.oid = d.defaclnamespace and n.nspname = 'public'
     cross join lateral aclexplode(d.defaclacl) a
     where d.defaclrole = 'postgres'::regrole
       and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))
     union all
     -- Without a global entry, PostgreSQL grants every new function to PUBLIC.
     select 'f to public' where not exists (
       select 1 from pg_default_acl d
       where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
         and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)
     ) $$,
  'New tables, sequences and functions are granted to no client by default'
);
select is_empty(
  $$ select c.relname || ' ' || g.privilege_type
     from information_schema.role_table_grants g
     join pg_class c on c.relname = g.table_name
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.table_schema
     where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated')
       and (c.relkind = 'v' and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
         or g.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')) $$,
  'No client may write to a view, or truncate, reference or trigger on a table'
);
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')) $$,
  'Trigger functions are closed to clients'
);
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') $$,
  'No owner-rights function is open to anon'
);

-- Identity columns need no grant on their sequence; a serial column would need one, which a
-- migration could forget.
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'i') $$,
  'Every sequence backs an identity column'
);

-- A new table and function are closed to clients until granted.
create table public.grants_test_table (id bigint generated always as identity primary key);
create function public.grants_test_function() returns int language sql as $$ select 1 $$;
select ok(
  not has_table_privilege('authenticated', 'public.grants_test_table', 'select')
    and not has_table_privilege('anon', 'public.grants_test_table', 'select'),
  'A new table is closed to clients'
);
select ok(
  not has_function_privilege('authenticated', 'public.grants_test_function()', 'execute')
    and not has_function_privilege('anon', 'public.grants_test_function()', 'execute'),
  'A new function is closed to clients'
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
  'insert_workout_exercises', 'last_day_past_everywhere', 'assert_device_today',
  'lock_planned_days', 'keep_user_planned_days', 'start_user_plan', 'settle_moves',
  'keep_planned_days_before_change', 'plan_by_weekdays', 'device_today_or_server', 'plans_workout_on', 'kept_through', 'is_planned_by_weekdays', 'default_started_on',
  'day_workouts', 'lock_user_streak', 'keep_streak_days', 'day_calories', 'my_streak_states', 'first_day_of_break', 'calories_count',
  'answer_breaks_through', 'ai_model_price', 'ai_cost', 'record_ai_usage',
  'lock_own_workout', 'lock_own_alternative', 'queue_coach_media_deletion',
  'plan_limits', 'has_waiting_choices', 'counted_workouts', 'counts_on_plan', 'refuse_held_workout', 'is_held_workout', 'refuse_held_workout_rows',
  'refuse_held_alternative', 'added_alternative_count', 'stamp_alternative_last_used', 'apply_plan_limits', 'apply_workout_limits',
  'apply_alternative_limits',
  'apply_plan_limits_on_subscription', 'apply_plan_limits_after_delete', 'apply_changed_plan_limits'
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
