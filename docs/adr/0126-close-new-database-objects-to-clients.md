# 0126. Close new database objects to clients

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Supabase's default privileges grant `anon` and `authenticated` everything on each new table, view, sequence and function in `public`, and PostgreSQL grants every new function to `PUBLIC`. Row level security guards a table's rows, but not a function's right to run, nor a view's or a table's other rights. So the migrations kept clients out one object at a time: almost 300 `revoke` statements. A migration that forgot one opened its object, and the database tests checked only a fixed list of helpers (#529). The review of 2026-11-13 found `recipe_values` still writable by `authenticated` (harmless only because the view cannot be written) and three trigger functions callable by clients.

## Decision

- **New objects in `public` are closed to clients until their migration grants them.** The default privileges of `postgres`, the role migrations run as, no longer grant `anon` and `authenticated` anything on tables, sequences and functions in `public`, and the global default no longer grants new functions to `PUBLIC`; migrations create functions in `public` alone.
- **A migration grants what it opens**, as most already did: `select`, `insert`, `update`, `delete` on a table that row level security guards, `execute` on a function the app calls.
- **What clients held without meaning to is revoked:** writes on views, `truncate`, `references` and `trigger` on tables, and every trigger function. Existing grants that are meant stay as they are.
- **The database tests check it:** the default privileges grant no client anything, no client may write to a view or truncate a table, no trigger function and no owner-rights function is open to `anon`, and a new table and function are closed.
- **Database tests that call `pg_temp` helpers as a signed-in user open function execute again for themselves**, inside the transaction they roll back.

## Alternatives considered

- **An allow-list of every function clients may call:** about 60 owner-rights functions and growing, so the list would change with most migrations; the closed default catches the forgotten revoke itself.
- **An event trigger revoking on each new function:** needs rights the hosted project's `postgres` role may not have, and hides the rule from the migration that creates the function.

## Consequences

- A forgotten grant fails loudly, as the app's call is refused in development and in its tests, instead of a forgotten revoke failing silently in production.
- Each new table and function carries a `grant` in its migration.
- Open pull requests that add tables or functions without grants need them added once this is merged.
