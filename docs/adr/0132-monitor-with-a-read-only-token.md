# 0132. Monitor with a token that can only read the database

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The Monitor workflow asks the hosted database whether the photo purge works, through the Management
API's query endpoint (ADR 0067). It used a copy of the deploy's access token, which reaches every
project of the account and can do anything the account can: run any SQL, change secrets, deploy
functions or delete the project. Its `monitoring` environment needs no approval, as a scheduled run
waiting for one would never check anything, so whatever the workflow on main runs can use that
token (#536).

Supabase's access tokens can now be scoped to chosen projects and permissions. With only
**Database: Read**, a token can run the Management API's read-only query, which runs as
`supabase_read_only_user`: a role that reads every table, bypassing row level security, but writes
nothing and may call only the functions it was granted.

## Decision

- **The Monitor's token is its own, scoped to this project with Database: Read alone, and
  expires.** It is not the deploy's token. Without other permissions it cannot read API keys or
  secrets, deploy, change settings or reach other projects. When it expires the Monitor fails and
  a new token replaces it.
- **The workflow uses the read-only query endpoint,** so the check runs as
  `supabase_read_only_user` whatever the token could do.
- **`supabase_read_only_user` may call `coach_media_purge_status()` and the rule it asks,
  `coach_media_purge_stalled()`.** Both only read, and run as their caller. No other role gains
  anything.

## Alternatives considered

- **A database role of our own that can only call the status function,** with the workflow
  connecting through the pooler with its password: narrower still, as it could read nothing else,
  but it needs a password set by hand in each project, a connection string as a secret and `psql`
  in the workflow.
- **An approval on the `monitoring` environment:** every daily run would wait for someone to
  approve it, so the check would rarely run.
- **An Edge Function that answers with the status for a secret of its own:** a function and a
  secret to keep only for the check.

## Consequences

- A leaked Monitor token can read the project's data, but cannot change or delete anything, read
  its keys, deploy or reach other projects; before, it could do all of these.
- Each status function a future check uses has to be granted to `supabase_read_only_user`, and
  has to work in a read-only transaction.
- The token has to be replaced when it expires; `docs/deployment.md` says how it is created.
