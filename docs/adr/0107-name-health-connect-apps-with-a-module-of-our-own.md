# 0107. Name Health Connect's apps with a module of our own

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Health Connect names the app that wrote data only by its package, such as `com.example.tracker`, while Apple Health gives the app's name. Benchbite showed a short list of known apps by name and every other app by its package, which no one should read, on the watch card, the history and Today (#468). Android gives an app's name through its `PackageManager`, which neither `react-native-health-connect` nor an Expo module exposes for another app.

## Decision

- **A local Expo module, `modules/app-names`, in Kotlin, Android only.** It has one function, `appName(packageName)`, which returns the name the app shows on the phone, or null for one the phone does not have or show. It is Benchbite's first module of its own; `src/health/platform.android.ts` is the only code that uses it.
- **It sees only the apps that work with Health Connect.** Android 11 and later hide other apps unless the app says which it looks for. The module's manifest asks for the apps that handle Health Connect's permission intents, not for all apps (`QUERY_ALL_PACKAGES`), which Google Play allows only with a reason.
- **Without a name, none.** An app the phone does not show, and Health Connect's own entries, give no source, and the screens name the store alone ("Through Health Connect"). The list of known apps goes.

## Alternatives considered

- **A longer list of known apps:** never complete, and wrong once an app renames itself.
- **The package when no name is known:** what the screens showed before, and what this replaces.
- **Asking for all apps:** more than needed, and a Google Play declaration to justify.

## Consequences

- Android builds include native code of Benchbite's own, built with the app; a change to it needs a new development build.
- Sources already kept with a package are named at the next read that covers them.
