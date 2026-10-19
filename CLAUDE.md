# Platefy

Platefy is a mobile app for tracking workouts and nutrition in one place.
It is a public portfolio project, so code, history and documentation are part of the product.

## Stack

| Layer | Technology |
|---|---|
| Mobile | React Native with Expo |
| Backend | Supabase: Postgres + Row Level Security, Auth, Storage, Realtime |
| Server-side logic | Supabase Edge Functions (Deno + TypeScript) |

There is no separate backend server.

## Workflow

Development is AI-assisted. The maintainer and Claude plan work together; Claude implements it
and opens pull requests as the `platefy-bot` GitHub App; the maintainer reviews and merges.

- Never push to `main`. It is protected; every change goes through a pull request.
- One pull request covers one topic. If a change grows beyond that, split it.
- Commit early and often. Each commit is a small, self-contained step that can be reviewed on its own.
- Pull requests are squash-merged, so the PR title becomes the commit on `main`.
- Address every review comment with a new commit. Do not force-push a branch under review.

### Naming

- Branches: `<type>/<short-description>`, e.g. `feat/login-screen`, `docs/project-conventions`.
- Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/):
  `<type>(<optional scope>): <summary>`, imperative mood, lower case, no trailing period.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, `chore`.

### Pull request descriptions

Use the template in `.github/pull_request_template.md`. Always explain **why** a change is made,
not only what changed, including alternatives that were considered.

## Language

Everything in the repository is written in English: code, identifiers, comments, commit messages,
branch names, documentation, SQL, log and error messages. No exceptions.

## Architecture rules

- **Business logic lives in Supabase**, not in the app:
  - Simple CRUD: call Supabase directly from the app; Row Level Security enforces access.
  - Atomic or multi-table operations: Postgres functions called via `rpc()`.
  - Automatic side effects: triggers.
  - Third-party APIs, secret keys or complex logic: Edge Functions.
  - Scheduled jobs: `pg_cron`.
- **Row Level Security is enabled on every table.** No exceptions.
- **Schema changes are made only through migrations.** Never change the schema from the dashboard.
- **Database types are generated** with `supabase gen types typescript`, never written by hand.

## Security

This repository is public.

- Never commit secrets. Only `.env.example` with placeholder values is committed.
- The app only contains the Supabase publishable (anon) key.
- The `service_role` key lives only in Edge Function secrets and CI secrets.
- Edge Functions verify the JWT and configure CORS explicitly.

## Documentation

- Significant decisions are recorded as Architecture Decision Records in `docs/adr/`.
  Add a new ADR in the same pull request that introduces the decision.
- Keep `README.md` accurate: setup instructions must work on a fresh machine.
