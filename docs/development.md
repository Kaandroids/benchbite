# Development

How to run Benchbite on your own machine: the app, the local Supabase stack and the Edge Functions.
For the hosted project, see [Deployment](deployment.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 24 LTS. The version is pinned in `.node-version`, which
  [fnm](https://github.com/Schniz/fnm) and [nvm](https://github.com/nvm-sh/nvm) pick up automatically.
- [pnpm](https://pnpm.io/), enabled through Corepack (ships with Node.js 24): `corepack enable`.
  Corepack then uses the exact pnpm version from `package.json`.
- [Expo Go](https://expo.dev/go) on an iOS or Android device, or an iOS Simulator / Android Emulator.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or another Docker-compatible runtime,
  for the local Supabase stack.
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2, to check and test the Edge
  Functions.

## Set up

```bash
git clone https://github.com/Kaandroids/benchbite.git
cd benchbite
corepack enable
pnpm install
cp .env.example .env.local
```

`.env.local` holds the Supabase URL and publishable key the app connects to. It is ignored by
Git, and the defaults point at the local Supabase stack.

## Run Supabase locally

The backend runs locally in Docker through the Supabase CLI, which is installed with the other
dependencies. With Docker running:

```bash
pnpm supabase start
```

The first start downloads the Docker images and takes a few minutes. When it finishes, the CLI
prints the local URLs and keys; `pnpm supabase status` shows them again. The keys are fixed
development values that only work against the local stack.

| Service            | URL                    |
| ------------------ | ---------------------- |
| API                | http://127.0.0.1:54321 |
| Studio (dashboard) | http://127.0.0.1:54323 |
| Mailpit (emails)   | http://127.0.0.1:54324 |

Useful commands:

| Command                  | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `pnpm supabase status`   | Show the local URLs and keys                                |
| `pnpm supabase db reset` | Recreate the local database from the migrations and seed it |
| `pnpm supabase test db`  | Run the database tests in `supabase/tests/`                 |
| `pnpm supabase stop`     | Stop the stack and keep its data                            |

See [ADR 0003](adr/0003-local-first-database-development.md) for how database changes are made.

After changing the schema, regenerate the TypeScript types with `pnpm db:types`.

### Dev account

`pnpm supabase db reset` also runs `supabase/seed.sql`, which creates an account that has finished
the onboarding: `dev@benchbite.local` with the password `benchbite-dev`. These work only against
the local database. In development, **Use the dev account** on the welcome screen and in the
developer tools (the code button beside the settings) signs in to it, so the onboarding can be
skipped after a reset.

### Exercise library

The exercise library comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db).
Its data is in a migration and its images are in `supabase/storage/exercise-images/`, so
`pnpm supabase start` and `pnpm supabase db reset` load both without a download. To update the
library, change the upstream commit in `scripts/import-exercises.ts` and run
`pnpm import:exercises`, which converts the images to WebP and writes a new migration. After
changing only the translated names in `supabase/data/exercise-names.json`, run
`pnpm import:exercises --names-only`, which writes a migration with just the names. See
[ADR 0008](adr/0008-exercise-library.md).

### Food library

The food library comes from the [BLS 4.0](https://blsdb.de) of the Max Rubner-Institut. The
foods it includes, with their English, German and Turkish names and their portions, are listed
by BLS code in `supabase/data/foods.json`. After changing that file, run `pnpm import:foods`,
which downloads the pinned BLS release, checks it and writes a new migration. See
[ADR 0033](adr/0033-food-library-from-bls.md).

### Edge Functions

Edge Functions live in `supabase/functions/` and run on Deno. `pnpm supabase start` serves them
at `http://127.0.0.1:54321/functions/v1/<name>`, and `pnpm supabase functions serve` serves them
with their logs in the terminal. Code shared between functions is in `supabase/functions/_shared/`.
See [ADR 0010](adr/0010-plan-builder-edge-function.md).

The AI coach calls Gemini from the Edge Functions
([ADR 0049](adr/0049-gemini-behind-our-own-model-interface.md)). To try it locally, copy
`supabase/functions/.env.example` to `supabase/functions/.env`, which sets `GEMINI_BACKEND=studio`,
and set `GEMINI_API_KEY` to a key
from [Google AI Studio](https://aistudio.google.com/apikey). The tests never call the model, so
they need no key.

A scheduled job calls `purge-coach-media`, which removes the photos of deleted chats, with the
project URL and secret key it reads from Vault
([ADR 0063](adr/0063-purge-chat-photos-from-a-queue.md)). Store the local stack's in its
Vault once, and again after `pnpm supabase db reset`:

```bash
pnpm vault:local
```

AI comes with a plan, so a user has no budget for it until they get one
([ADR 0051](adr/0051-ai-usage-and-a-monthly-limit.md)). To give your local account one, run
in Studio's SQL editor:

```sql
insert into public.ai_budgets (user_id, monthly_limit_usd)
select id, 4 from auth.users where email = 'you@example.com';
```

## Run the app

With the local Supabase stack running:

```bash
pnpm start
```

Scan the QR code with the camera (iOS) or Expo Go (Android). Press `i` or `a` in the terminal
to open the iOS Simulator or Android Emulator instead. Restart the dev server after changing
`.env.local`.

`127.0.0.1` in `.env.local` reaches your computer directly from the iOS Simulator. Elsewhere:

- **Android Emulator, or an Android device connected over USB:** forward the Supabase port to
  your computer with `adb` (part of the Android SDK platform tools). Run it again after the
  emulator or device restarts:

  ```bash
  adb reverse tcp:54321 tcp:54321
  ```

- **Physical device over Wi-Fi:** change `EXPO_PUBLIC_SUPABASE_URL` to your computer's IP
  address on the local network, for example `http://192.168.1.20:54321`. The phone must be on
  the same network. On macOS, `ipconfig getifaddr en0` prints the address.

## Scripts

| Command                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `pnpm start`            | Start the Expo dev server                             |
| `pnpm typecheck`        | Type-check with TypeScript                            |
| `pnpm lint`             | Lint with ESLint (fails on warnings)                  |
| `pnpm format`           | Format all files with Prettier                        |
| `pnpm format:check`     | Check formatting without changing it                  |
| `pnpm test`             | Run the app's tests with Jest                         |
| `pnpm check:locales`    | Check that all translations have the same keys        |
| `pnpm db:types`         | Generate TypeScript types from the local database     |
| `pnpm import:exercises` | Import the exercise library from free-exercise-db     |
| `pnpm import:foods`     | Import the food library from the BLS 4.0              |
| `pnpm icons`            | Draw the app icons and the splash image from the mark |
| `pnpm functions:check`  | Type-check, lint and test the Edge Functions          |
| `pnpm vault:local`      | Store the local URL and secret key for the purge      |
| `pnpm check:plans`      | Check every generated workout plan on the local stack |
| `pnpm seed:demo`        | Recreate the demo account of the README screenshots   |

CI runs most of these on every pull request; [CONTRIBUTING.md](../CONTRIBUTING.md) lists what it
checks.

## Project structure

```
src/app/               Expo Router screens and layouts only
src/                   components, hooks and other app code, by feature
supabase/migrations/   the database schema, changed only through migrations
supabase/tests/        pgTAP tests of tables, policies and functions
supabase/functions/    Edge Functions, with shared code in _shared/
scripts/               the exercise and food imports (shared helpers in lib/), the locale check
                       and the plan check
docs/adr/              Architecture Decision Records
docs/development.md    this guide; docs/deployment.md covers the hosted project
docs/media/            the screenshots and GIFs in the README, and how to make them
```
