# 0097. Read workouts from Apple Health and Health Connect

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

Users want the heart rate and calories their watch measured on their workouts (#85), from any watch: Apple Watch, Wear OS, and others such as Amazfit and Garmin. Apps of our own run only on Apple Watch and Wear OS (#470, #471), while nearly every watch's app writes what it measures to the phone's store of health data: Apple Health on iOS, Health Connect on Android. Heart rate is health data under the GDPR (Art. 9), and both stores ask apps to explain what they read.

## Decision

- **Benchbite reads the phone's store, not the watch.** Which store follows from the phone: Apple Health on iOS, Health Connect on Android. The watch's brand does not matter, as long as its app writes there; the data names the app or watch that measured it.
- **Two community modules, behind one interface.** `@kingstinct/react-native-healthkit` (with `react-native-nitro-modules`) on iOS and `react-native-health-connect` on Android, both with config plugins. Expo has no module for either store. `src/health/health.ts` is the only part of the app that knows them: each platform's file (`platform.ios.ts`, `platform.android.ts`) implements the same few functions, and other platforms read nothing.
- **Only heart rate and active calories,** read for the time of a workout. A data type is added with the feature that uses it, as Google Play asks a reason for each.
- **Consent before the system's own screen.** A sheet says what is read, what is kept and that nothing is written to the store; the system then asks. Disconnecting stops reading, and on Android gives up what was allowed; iOS lets only the Health app take it back.
- **The connection belongs to the phone and the user.** It is kept in the device's storage, per user, so another user on the same phone starts unconnected.
- **Android needs version 8 (API 26)**, which Health Connect requires, set through `expo-build-properties`. Before Android 14 Health Connect is an app of its own: the app points to Google Play when it is missing or out of date.

## Alternatives considered

- **Modules of our own, in Swift and Kotlin:** only a few calls are needed, but permissions, units and the stores' quirks are already solved in the community modules, and the interface keeps them replaceable.
- **Each watch maker's cloud API (Garmin, Zepp, Fitbit):** an integration and an agreement per maker, a server that holds their tokens, and none for Apple Watch.
- **Our own watch apps first:** they cover only Apple Watch and Wear OS, and need this bridge anyway for heart rate and calories (#470).

## Consequences

- Development needs development builds (ADR 0096), and a rebuild when either module changes.
- Data can arrive late: some watch apps write to the store minutes or hours after a workout, so reading is tried again (#85).
- Before release: the privacy policy names the data (#44), Google Play's Health apps declaration is approved, and the App Store review notes say why it is read.
- Android 7 and older are no longer supported.
