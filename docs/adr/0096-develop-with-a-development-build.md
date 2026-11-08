# 0096. Develop with a development build

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The app has been developed in Expo Go, which holds only the native modules it ships with. Reading heart rate and calories from Apple Health and Health Connect (#467) needs native modules that Expo Go does not have, and so will the watch apps later (#470, #471). Releases are already built on the machine, with `expo run:ios`, into folders that are generated and ignored by Git.

## Decision

- **Develop in a development build, made with `expo-dev-client`.** It is the app itself, with its own native modules and Expo's development tools: the dev menu, reloading and the launcher that finds the dev server. `pnpm start` opens it in place of Expo Go.
- **Build it on the machine:** `pnpm expo run:ios` and `pnpm expo run:android`, once for each simulator, emulator or device, and again when native code or `app.json` changes. Code changes need only the dev server, as before.
- **The development build is an app of its own:** "Benchbite Dev", `com.benchbite.app.dev`, with the scheme `benchbite-dev`, set by `app.config.ts`. A release build is made with `APP_VARIANT=production`. A phone can then keep a release build against the hosted project beside the development build, each with its own storage and notifications.
- **The native folders stay generated** and ignored by Git (Continuous Native Generation): native settings live in `app.json`, `app.config.ts` and config plugins.
- **Building in the cloud** with EAS for preview and production is left to #165.

## Alternatives considered

- **Staying in Expo Go:** not possible once a native module outside it is added.
- **EAS Build for development builds too:** builds without Xcode or Android Studio, but each build waits in a queue, and both are already needed for the simulators and releases.
- **Committing `ios/` and `android/`:** native changes by hand, which Continuous Native Generation avoids, and folders that drift from `app.json`.

## Consequences

- Each simulator, emulator and phone needs the build installed, and a rebuild after native changes, which takes minutes.
- Xcode and Android Studio are needed to develop, not only to release.
- Phones run the app with its own icon and permissions, rather than inside Expo Go.
- Native settings that name the app, such as the HealthKit entitlement, apply to both identities.
- The development client adds a local network text and its own URL scheme to every iOS build, release included; release builds for the stores leave the development client out (#165).
