-- New tables, views, sequences and functions in public are closed to clients until a migration
-- grants what it means to open, instead of open until one revokes it (#529, ADR 0126). Supabase's
-- default privileges grant anon and authenticated everything on each new object, and PostgreSQL
-- grants every new function to PUBLIC, so safety rested on each migration remembering to revoke.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
-- PUBLIC's execute on new functions is PostgreSQL's own default, which only the global default
-- privileges can take back, not a schema's. Migrations create functions in public alone.
alter default privileges for role postgres revoke execute on functions from public;

-- What clients hold on existing objects without meaning to. None of it is reachable through the
-- API today, but each would be the first step of a mistake.

-- Writes on views, which cannot be written to, and the table rights no client needs: truncate
-- skips row level security, references and triggers belong to migrations. The table-wide revoke
-- covers truncate on views too.
do $$
declare
  view_name text;
begin
  for view_name in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format(
      'revoke insert, update, delete on public.%I from anon, authenticated', view_name
    );
  end loop;
end;
$$;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Trigger functions, which run with the trigger and are never called by a client.
do $$
declare
  trigger_function regprocedure;
begin
  for trigger_function in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', trigger_function);
  end loop;
end;
$$;
