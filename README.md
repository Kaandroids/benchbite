# Benchbite

[![CI](https://github.com/Kaandroids/benchbite/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaandroids/benchbite/actions/workflows/ci.yml)

A mobile app for tracking workouts and nutrition in one place.

> **Status:** Early development. The app currently shows a blank start screen.

## Tech stack

- **Mobile:** React Native with Expo
- **Backend:** Supabase (Postgres, Row Level Security, Auth, Storage, Edge Functions)

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 24 LTS. The version is pinned in `.node-version`, which
  [fnm](https://github.com/Schniz/fnm) and [nvm](https://github.com/nvm-sh/nvm) pick up automatically.
- [pnpm](https://pnpm.io/), enabled through Corepack (ships with Node.js 24): `corepack enable`.
  Corepack then uses the exact pnpm version from `package.json`.
- [Expo Go](https://expo.dev/go) on an iOS or Android device, or an iOS Simulator / Android Emulator.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or another Docker-compatible runtime,
  for the local Supabase stack.
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2, to check and test the Edge
  Functions.

### Set up

```bash
git clone https://github.com/Kaandroids/benchbite.git
cd benchbite
corepack enable
pnpm install
cp .env.example .env.local
```

`.env.local` holds the Supabase URL and publishable key the app connects to. It is ignored by
Git, and the defaults point at the local Supabase stack.

### Run Supabase locally

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

| Command                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `pnpm supabase status`   | Show the local URLs and keys                    |
| `pnpm supabase db reset` | Recreate the local database from the migrations |
| `pnpm supabase test db`  | Run the database tests in `supabase/tests/`     |
| `pnpm supabase stop`     | Stop the stack and keep its data                |

See [ADR 0003](docs/adr/0003-local-first-database-development.md) for how database changes are made.

After changing the schema, regenerate the TypeScript types with `pnpm db:types`.

#### Exercise library

The exercise library comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db).
Its data is in a migration and its images are in `supabase/storage/exercise-images/`, so
`pnpm supabase start` and `pnpm supabase db reset` load both without a download. To update the
library, change the upstream commit in `scripts/import-exercises.ts` and run
`pnpm import:exercises`, which converts the images to WebP and writes a new migration. After
changing only the translated names in `supabase/data/exercise-names.json`, run
`pnpm import:exercises --names-only`, which writes a migration with just the names. See
[ADR 0008](docs/adr/0008-exercise-library.md).

#### Edge Functions

Edge Functions live in `supabase/functions/` and run on Deno. `pnpm supabase start` serves them
at `http://127.0.0.1:54321/functions/v1/<name>`, and `pnpm supabase functions serve` serves them
with their logs in the terminal. Code shared between functions is in `supabase/functions/_shared/`.
See [ADR 0010](docs/adr/0010-plan-builder-edge-function.md).

### Run the app

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

### Scripts

| Command                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `pnpm start`            | Start the Expo dev server                             |
| `pnpm typecheck`        | Type-check with TypeScript                            |
| `pnpm lint`             | Lint with ESLint (fails on warnings)                  |
| `pnpm format`           | Format all files with Prettier                        |
| `pnpm format:check`     | Check formatting without changing it                  |
| `pnpm check:locales`    | Check that all translations have the same keys        |
| `pnpm db:types`         | Generate TypeScript types from the local database     |
| `pnpm import:exercises` | Import the exercise library from free-exercise-db     |
| `pnpm functions:check`  | Type-check, lint and test the Edge Functions          |
| `pnpm check:plans`      | Check every generated workout plan on the local stack |

## Development workflow

This project uses an AI-assisted workflow. Features are planned together with
[Claude Code](https://claude.com/claude-code), implemented by the `benchbite-bot` GitHub App
in pull requests, and reviewed and merged by the maintainer.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CLAUDE.md](CLAUDE.md) for the full set of conventions.

## Documentation

- [Architecture Decision Records](docs/adr/README.md)

## Acknowledgements

The exercise data and images come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
by Clint Plummer ([@yuhonas](https://github.com/yuhonas)) and contributors, released into the
public domain under the [Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md).

## License

[MIT](LICENSE)
