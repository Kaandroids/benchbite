# Development

How to run Benchbite on your own machine: the app, the local Supabase stack and the Edge Functions.
For the hosted project, see [Deployment](deployment.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 24 LTS. The version is pinned in `.node-version`, which
  [fnm](https://github.com/Schniz/fnm) and [nvm](https://github.com/nvm-sh/nvm) pick up automatically.
- [pnpm](https://pnpm.io/), enabled through Corepack (ships with Node.js 24): `corepack enable`.
  Corepack then uses the exact pnpm version from `package.json`.
- [Xcode](https://developer.apple.com/xcode/) for the iOS Simulator and iPhones, and
  [Android Studio](https://developer.android.com/studio) for the Android Emulator and Android devices,
  to build the development app (see [Run the app](#run-the-app)).
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

### Email

Locally, Auth sends email to Mailpit and not to anyone: read codes at <http://127.0.0.1:54324>. After
changing `supabase/config.toml` or `supabase/templates/`, run `pnpm supabase stop` and
`pnpm supabase start`, which keeps the data.

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

It also sets `dev_tools` to `on`, which lets the developer tools change data on the server, such
as putting the signed-in account on the free plan, the trial or premium
([ADR 0080](adr/0080-developer-tools-switch-the-plan-behind-a-vault-flag.md)). A hosted project
never has it.

AI comes with premium, so a user has no budget for it until they have it
([ADR 0078](adr/0078-a-premium-plan-with-a-trial.md)). Switch the plan of the account you are
signed in with under **Plan** in the app's developer tools, or, to give your local account a year
of premium, run in Studio's SQL editor:

```sql
select public.give_plan('you@example.com', now(), now() + interval '1 year');
```

## Run the app

The app runs in a development build: Benchbite itself, built on your machine with the native
modules it uses and Expo's development tools, rather than Expo Go, which has only its own
([ADR 0096](adr/0096-develop-with-a-development-build.md)). Generate its native folders, then
build it once for each simulator, emulator or device:

```bash
pnpm native:dev                  # fresh ios/ and android/ folders for the development build
pnpm ios                         # the iOS Simulator
pnpm android                     # the Android Emulator, or a device connected over USB
pnpm ios --device                # an iPhone connected over USB, which asks which one
```

It is installed as **Benchbite Dev**, an app of its own (`com.benchbite.app.dev`, set in
`app.config.ts`), so a phone can have it beside a release build of Benchbite. The `ios/` and
`android/` folders are ignored by Git, and `pnpm ios` and `pnpm android` reuse the ones they find:
folders left by a release build would make the development build Benchbite itself, in place of
the release. An iPhone needs **Developer Mode** (Settings → Privacy & Security) and is signed with
the project's Apple developer team.

Then, with the local Supabase stack running, start the dev server:

```bash
pnpm start
```

Press `i` or `a` in the terminal to open the app in the iOS Simulator or Android Emulator, or
scan the QR code with a phone that has the development build. Restart the dev server after
changing `.env.local`.

Changes to the code only need the dev server. Build again from fresh native folders after a
release build, adding or updating a library with native code, changing `app.json` or
`app.config.ts`, or upgrading the Expo SDK:

```bash
pnpm native:dev
pnpm ios                         # or pnpm android
```

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

### The Apple Watch app

The Apple Watch app is built with the iPhone app, which carries it (`targets/watch`,
[ADR 0110](adr/0110-build-the-apple-watch-app-as-a-target-beside-the-app.md)). On an iPhone, the
Watch app on the phone installs it on the paired watch. In the simulators, pair an Apple Watch
simulator with the iPhone one in Xcode (Window → Devices and Simulators), build with `pnpm ios`,
then install the watch app on the watch simulator from the build's products:

```bash
xcrun simctl install <watch simulator id> \
  ~/Library/Developer/Xcode/DerivedData/BenchbiteDev-*/Build/Products/Debug-watchsimulator/BenchbiteWatch.app
```

`xcrun simctl list pairs` shows the pair and the simulators' ids. Start a workout on the iPhone,
and the watch shows it.

## Add a language

The app's text is in `src/i18n/locales/`, one file per language (ADR 0007). iOS takes the sentence
under a permission prompt from `src/i18n/permissions/`, which `expo.locales` in `app.json` names. A
new language needs all of these:

1. `src/i18n/locales/<code>.json`, imported in `src/i18n/index.ts`, and its code in
   `SUPPORTED_LANGUAGES`.
2. `src/i18n/permissions/<code>.json`, with the keys of `en.json`.
3. `"<code>": "./src/i18n/permissions/<code>.json"` in `expo.locales` in `app.json`, then a new
   development build.

`pnpm check:locales` checks that the files and `expo.locales` hold the same languages and keys, and
that the English permission texts are those the config plugins in `app.json` write to Info.plist
(ADR 0102). A new permission text goes in the plugin's options in `app.json`, in each file in
`src/i18n/permissions/` and in `PLUGIN_TEXTS` in `scripts/check-locales.ts`. Set it in `app.json`
even when the plugin has a default text: the check sees only the texts `app.json` sets.

iOS picks a permission text by the phone's language, or the per-app language in iOS Settings, not by
the language chosen in Benchbite.

## Run the website

The website in `website/` is a package of its own, with its own dependencies:

```bash
cd website
pnpm install
pnpm dev     # serves it on http://localhost:4321
pnpm check   # type-checks the pages and the translations
pnpm build   # writes the static site to website/dist
```

`pnpm dev` runs in the background; `pnpm astro dev stop` stops it. Its text is in `src/i18n/`, one
file per language. See [ADR 0088](adr/0088-a-static-website-in-the-repository.md).

## Scripts

| Command                 | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `pnpm start`            | Start the Expo dev server                             |
| `pnpm typecheck`        | Type-check with TypeScript                            |
| `pnpm lint`             | Lint with ESLint (fails on warnings)                  |
| `pnpm format`           | Format all files with Prettier                        |
| `pnpm format:check`     | Check formatting without changing it                  |
| `pnpm test`             | Run the app's tests with Jest                         |
| `pnpm check:locales`    | Check that translations and permission texts match    |
| `pnpm db:types`         | Generate TypeScript types from the local database     |
| `pnpm import:exercises` | Import the exercise library from free-exercise-db     |
| `pnpm import:foods`     | Import the food library from the BLS 4.0              |
| `pnpm icons`            | Draw the app icons and the splash image from the mark |
| `pnpm functions:check`  | Type-check, lint and test the Edge Functions          |
| `pnpm vault:local`      | Store the local Vault secrets and turn on dev tools   |
| `pnpm check:plans`      | Check every generated workout plan on the local stack |
| `pnpm seed:demo`        | Recreate the demo account of the README screenshots   |

CI runs most of these on every pull request; [CONTRIBUTING.md](../CONTRIBUTING.md) lists what it
checks.

## Project structure

```
src/app/               Expo Router screens and layouts only
src/                   components, hooks and other app code, by feature
modules/               Expo modules of the app's own, in native code; a change needs a new
                       development build
targets/               Apple targets beside the app, such as the Apple Watch app in SwiftUI;
                       a change needs a new development build
supabase/migrations/   the database schema, changed only through migrations
supabase/tests/        pgTAP tests of tables, policies and functions
supabase/functions/    Edge Functions, with shared code in _shared/
scripts/               the exercise and food imports (shared helpers in lib/), the locale check
                       and the plan check
website/               the website, a package of its own
docs/adr/              Architecture Decision Records
docs/development.md    this guide; docs/deployment.md covers the hosted project
docs/media/            the screenshots and GIFs in the README, and how to make them
```
