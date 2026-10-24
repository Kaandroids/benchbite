# Benchbite

Benchbite is a mobile app for tracking workouts and nutrition in one place.
It is developed in the open, so code, history and documentation are held to the same standard as the app.

## Stack

| Layer             | Technology                                                       |
| ----------------- | ---------------------------------------------------------------- |
| Mobile            | React Native with Expo                                           |
| Backend           | Supabase: Postgres + Row Level Security, Auth, Storage, Realtime |
| Server-side logic | Supabase Edge Functions (Deno + TypeScript)                      |

There is no separate backend server.

Expo-specific guidance for AI agents lives in `AGENTS.md`, which is maintained by the Expo template:

@AGENTS.md

## Commands

This project uses pnpm. Use `pnpm expo ...` wherever Expo docs or `AGENTS.md` say `npx expo ...`.

```bash
pnpm install              # install dependencies
pnpm start                # start the Expo dev server
pnpm expo install <pkg>   # add a dependency (resolves SDK-compatible versions)
pnpm typecheck            # TypeScript
pnpm lint                 # ESLint, fails on warnings
pnpm format               # format with Prettier (format:check only verifies)
pnpm test                 # Jest tests of the app
```

Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test` before every commit.

## Project structure

```
src/app/      # Expo Router screens and layouts only
src/          # components, hooks and other app code
assets/       # images and icons
docs/adr/     # Architecture Decision Records
```

## Workflow

Development is AI-assisted. The maintainer and Claude plan work together; Claude implements it
and opens pull requests as the `benchbite-bot` GitHub App; the maintainer reviews and merges.

- Never push to `main`. It is protected; every change goes through a pull request.
- One pull request covers one topic. If a change grows beyond that, split it.
- Commit early and often. Each commit is a small, self-contained step that can be reviewed on its own.
  Split a change into as many commits as it has steps, for example the data layer, each screen,
  translations and tests, rather than one commit for a whole feature.
- Keep commit messages short: the subject line, and at most two or three lines of body when the
  reason is not obvious. Details belong in the pull request description.
- Pull requests are squash-merged, so the PR title becomes the commit on `main`.
- Address every review comment with a new commit. Do not force-push a branch under review.
- Every pull request Claude opens gets an automated review: after `gh pr create`, a hook in
  `.claude/settings.json` asks Claude to run the `review-pr` skill, which reviews principles,
  security, and logic and performance in parallel and posts one comment on the PR.
- Do not implement a design before it is approved. For new screens and visible UI changes, Claude
  first proposes the design as an Artifact (a mock-up of the screens and their states); the
  maintainer approves it before any code is written.

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
