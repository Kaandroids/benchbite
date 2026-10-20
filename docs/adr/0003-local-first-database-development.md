# 0003. Develop the database against a local Supabase stack

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Most business logic lives in Supabase: tables, Row Level Security policies, Postgres functions,
triggers and Edge Functions. Changes to them need a place to be written and tested before they
reach a hosted project, and the result has to be reviewable in a pull request like any other code.

## Decision

Every developer runs the full Supabase stack locally with the Supabase CLI, which starts it in
Docker. Schema changes are written as migrations in `supabase/migrations/`, tested locally with
`supabase db reset`, reviewed in a pull request and only then applied to hosted projects.
Nothing is changed from the hosted dashboard.

The CLI is a dev dependency, so its version is pinned in `pnpm-lock.yaml` and it runs as
`pnpm supabase <command>`. The local stack is configured in `supabase/config.toml`, which is
committed.

## Alternatives considered

- **Developing directly against a hosted development project**: needs no Docker, but one shared
  database means developers overwrite each other's work, a mistake cannot be undone with a reset,
  and dashboard edits tend to bypass migrations.
- **Installing the CLI globally** (Homebrew or a binary): every machine and CI would run whatever
  version happens to be installed, and nothing would keep it up to date.

## Consequences

- The whole backend can be rebuilt from the repository with one command, which also makes it
  possible to test migrations and policies in CI later.
- Developers need Docker running, and the stack uses a few GB of disk and memory.
- The local stack only approximates a hosted project; settings that live outside
  `config.toml`, such as production secrets and SMTP, still have to be configured per project.
