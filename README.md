# Benchbite

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

### Run the app

```bash
git clone https://github.com/Kaandroids/benchbite.git
cd benchbite
corepack enable
pnpm install
pnpm start
```

Scan the QR code with the camera (iOS) or Expo Go (Android). Press `i` or `a` in the terminal
to open a simulator instead.

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
