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
| `pnpm supabase stop`     | Stop the stack and keep its data                |

See [ADR 0003](docs/adr/0003-local-first-database-development.md) for how database changes are made.

### Run the app

With the local Supabase stack running:

```bash
pnpm start
```

Scan the QR code with the camera (iOS) or Expo Go (Android). Press `i` or `a` in the terminal
to open a simulator instead. Restart the dev server after changing `.env.local`.

`127.0.0.1` in `.env.local` only reaches your computer from the iOS Simulator. Change
`EXPO_PUBLIC_SUPABASE_URL` to:

- your computer's IP address on the local network (for example `http://192.168.1.20:54321`) on
  a physical device; the phone must be on the same network. On macOS, `ipconfig getifaddr en0`
  prints the address.
- `http://10.0.2.2:54321` on the Android Emulator.

### Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm start`        | Start the Expo dev server            |
| `pnpm typecheck`    | Type-check with TypeScript           |
| `pnpm lint`         | Lint with ESLint (fails on warnings) |
| `pnpm format`       | Format all files with Prettier       |
| `pnpm format:check` | Check formatting without changing it |

## Development workflow

This project uses an AI-assisted workflow. Features are planned together with
[Claude Code](https://claude.com/claude-code), implemented by the `benchbite-bot` GitHub App
in pull requests, and reviewed and merged by the maintainer.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CLAUDE.md](CLAUDE.md) for the full set of conventions.

## Documentation

- [Architecture Decision Records](docs/adr/README.md)

## License

[MIT](LICENSE)
