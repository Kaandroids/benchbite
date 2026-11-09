# 0105. Save workouts to the health store

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

Benchbite reads the phone's health store and writes nothing to it (ADR 0097). Users of Apple Health and Health Connect expect a workout app to add its workouts there, so that strength training counts in Apple Fitness's Activity rings and in other apps that read the store (#479). A watch may already record the same workout, as an Apple Watch does when the user starts a workout on it, and two copies would count the calories twice.

## Decision

- **Writing is a choice of its own, off by default.** A switch under the connected store in the settings turns it on. Before the system asks, a sheet says what is written; the system then asks for writing workouts and active calories, apart from what is read. Like the connection, the choice belongs to the phone and its owner (ADR 0031) and is let go of when another user signs in. Disconnecting turns writing off.
- **What is written:** each workout finished from then on, as strength training (`traditionalStrengthTraining` in HealthKit, `STRENGTH_TRAINING` in Health Connect), with its start, end and the active calories its log shows: the watch's when measured, else the estimate (ADR 0104). No heart rate or sets: the watch's heart rate is already in the store, and neither store has a place for sets. Workouts finished before writing was turned on are not written.
- **Kept right for a day, by the catch-up.** Each time the app reads a log of the last day again (ADR 0099), it also compares the store with it: the workout is written when the store has none in its time, rewritten when its calories changed, and taken out again when another app's workout turns up there later, as from a watch that syncs late. Benchbite's own workout is found by the log's id, kept with it (HealthKit's `HKExternalUUID` metadata, Health Connect's `clientRecordId`). On Android this needs reading exercise sessions too.
- **A workout the watch recorded is not written.** Another app's workout that covers more than half of the log's time counts as the watch's; a run just before or after only touches it.
- **Workouts and their calories are allowed together.** Both systems let the user allow writing one without the other, so writing counts as allowed only with both. When either is taken back later, saving turns off.
- **The log shows what happened:** "Saved to Apple Health" or "Already in Apple Health, recorded by your watch", read from the store when the log opens, so nothing about it is kept on the server.

## Alternatives considered

- **Writing once, at the finish:** a watch that syncs later would leave two copies, and calories measured later would never reach the store.
- **Writing every workout, past ones too:** would change the user's past Activity rings without asking.
- **Writing the heart rate and the sets:** the heart rate came from the store, and the stores have no type for sets.
- **Keeping on the server whether a log was written:** the store is per phone, and the store itself already says.

## Consequences

- Strength training counts in Activity rings and in apps that read the store.
- A workout deleted in Benchbite is taken out of the store too, while workouts are saved to it, so it no longer counts in the Activity rings; one saved before saving was turned off stays, and the user deletes it in the Health app or in Health Connect.
- Turning writing off keeps what was written.
- The iOS texts no longer say Benchbite writes nothing, and ask for writing in en, de and tr (ADR 0102). Google Play's Health declaration names writing exercise and active calories, and reading exercise.
- ADR 0097's "nothing is written to the store" no longer holds once the user turns writing on.
