# Benchbite

[![CI](https://github.com/Kaandroids/benchbite/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaandroids/benchbite/actions/workflows/ci.yml)

A mobile app for tracking workouts and nutrition in one place.

> **Status:** In development. Onboarding, workout tracking and email accounts work end to end;
> nutrition tracking comes next. There is no release yet. See the [roadmap](#roadmap).

## Features

- **Start without an account.** People use the app as a guest; the session lives on the device
  ([ADR 0005](docs/adr/0005-guest-first-accounts.md)). A guest can create an account with an
  email address and a password at any time, keeping everything logged so far, and log in on
  another device ([ADR 0031](docs/adr/0031-email-and-password-accounts.md)).
- **Onboarding** asks for the goal, body data and training preferences in three sections, then
  calculates daily calorie and macro targets and builds a weekly workout plan that fits the
  chosen workout length ([ADR 0009](docs/adr/0009-nutrition-targets.md),
  [ADR 0010](docs/adr/0010-plan-builder-edge-function.md)).
- **Today** shows the week's workouts, today's workout or the next one, the daily targets and the
  weight.
- **Workouts** can be edited, reordered, archived and created from scratch, from a library of
  about 870 exercises or the user's own exercises with private photos.
- **Logging a workout:** sets with weight, reps, time or distance, a rest timer that notifies in
  the background, and a summary with estimated calories at the end. A workout left open is saved
  on its own after 12 hours.
- **History and records:** every finished workout by week, editable afterwards, and per exercise
  its progress chart and records such as the heaviest set and the estimated one-rep max.
- **Settings:** English, German and Turkish, and a light, dark or system appearance.

## Tech stack

| Layer             | Technology                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| Mobile            | React Native with Expo, Expo Router, TanStack Query, i18next              |
| Backend           | Supabase: Postgres with row level security, Auth, Storage, Edge Functions |
| Server-side logic | Postgres functions and triggers; Edge Functions in Deno and TypeScript    |
| Tests             | Jest and React Native Testing Library, pgTAP, Deno test                   |

There is no separate backend server: the app talks to Supabase directly, row level security
decides what each user may read and write, and anything atomic or multi-table runs in Postgres
functions ([ADR 0001](docs/adr/0001-react-native-and-supabase.md)).

## Project structure

```
src/app/               Expo Router screens and layouts only
src/                   components, hooks and other app code, by feature
supabase/migrations/   the database schema, changed only through migrations
supabase/tests/        pgTAP tests of tables, policies and functions
supabase/functions/    Edge Functions, with shared code in _shared/
scripts/               the exercise import, the locale check and the plan check
docs/adr/              Architecture Decision Records
```

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
| `pnpm test`             | Run the app's tests with Jest                         |
| `pnpm check:locales`    | Check that all translations have the same keys        |
| `pnpm db:types`         | Generate TypeScript types from the local database     |
| `pnpm import:exercises` | Import the exercise library from free-exercise-db     |
| `pnpm icons`            | Draw the app icons and the splash image from the mark |
| `pnpm functions:check`  | Type-check, lint and test the Edge Functions          |
| `pnpm check:plans`      | Check every generated workout plan on the local stack |

CI runs most of these on every pull request; [CONTRIBUTING.md](CONTRIBUTING.md) lists what it
checks.

## Development workflow

This project uses an AI-assisted workflow. Features are planned together with
[Claude Code](https://claude.com/claude-code), implemented by the `benchbite-bot` GitHub App
in pull requests, and reviewed and merged by the maintainer. Each pull request Claude opens is
first reviewed automatically for design, security, and logic and performance, with the skills in
[`.claude/skills/`](.claude/skills/).

## Deployment

The hosted Supabase project is deployed by the **Deploy** workflow in GitHub Actions
([ADR 0030](docs/adr/0030-deploy-supabase-from-github-actions.md)). It links the project, pushes the
settings in `supabase/config.toml`, applies new migrations and deploys the Edge Functions; it uploads
the exercise images when asked. It reads `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and
`SUPABASE_DB_PASSWORD` from the repository's `production` environment. Start it from the Actions tab
with **Run workflow**.

### Install on an iPhone

A release build runs on its own, without the dev server, against the hosted project. It needs a Mac
with Xcode and an Apple Developer account added in Xcode's settings.

> [!WARNING]
> Benchbite is still in development. The hosted database may be reset at any time, and with it every
> account, plan and workout logged in a build that uses it.

1. Create `.env.production.local` (ignored by Git) with the hosted project's values, from the
   Supabase dashboard's project settings:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   The URL is the project's root, without `/rest/v1`. This file takes precedence over `.env.local`,
   which still points at the local stack. Never put a secret key in it: everything in it ends up in
   the app.

2. Connect the iPhone, trust the Mac, and turn on **Developer Mode** (Settings → Privacy & Security).
3. Find the iPhone's UDID with `xcrun devicectl list devices`, then build and install:

   ```bash
   pnpm expo run:ios --device <udid> --configuration Release
   ```

   The first build generates the `ios/` folder (ignored by Git). If it changes the `ios` and
   `android` scripts in `package.json`, undo that change. Run the command again to install a newer
   version.

## Documentation

- [Architecture Decision Records](docs/adr/README.md): why the app is built the way it is
- [CLAUDE.md](CLAUDE.md): the conventions every change follows
- [CONTRIBUTING.md](CONTRIBUTING.md): how changes get into the project

## Acknowledgements

The exercise data and images come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
by Clint Plummer ([@yuhonas](https://github.com/yuhonas)) and contributors, released into the
public domain under the [Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md).

## License

[MIT](LICENSE)
