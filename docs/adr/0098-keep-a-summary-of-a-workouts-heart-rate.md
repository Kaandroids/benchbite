# 0098. Keep a summary of a workout's heart rate

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The app reads what a watch measured from the phone's health store (ADR 0097). A finished workout should show its heart rate and the calories the watch measured, in place of the estimate at 5 METs (`estimated_kcal`, ADR 0021), also on another phone and for Bite. Heart rate is health data under the GDPR, and some watch apps write to the store minutes or hours after a workout.

## Decision

- **A workout log keeps a summary:** the average and highest heart rate, the active calories, and the name of the app or watch that measured them (`heart_rate_avg`, `heart_rate_max`, `active_kcal`, `health_source` on `workout_logs`), each missing when nothing measured it. Ranges a person can have are checked, and the average cannot pass the highest.
- **Not the samples.** A chart over the workout would need every measurement; it can come later, with its own decision.
- **`set_workout_health()` keeps it,** only on the caller's own log, and decides what to keep in one place: the stores' fractions are rounded; a value no person or watch can have, such as a sensor's spike, is left out on its own rather than failing the others; a value read as missing keeps what was kept before, as data arrives in parts or a later read finds less; and the source changes only with a value. Logs stay closed to direct updates.
- **The app reads it after the workout** and again while it is missing, for a day, and only while the user has connected the store; the screens show the measured calories in place of the estimate.
- **It goes with the log,** and with the account, as the log's columns.

## Alternatives considered

- **A table of its own:** it would keep health data apart, but it is one row per log at most, read with it everywhere it is shown.
- **Keeping only the first read:** data that arrives later, or in parts, would never complete it.
- **Replacing everything on each read:** a later read that finds less, on another phone or after access was taken back, would wipe what was kept.
- **Reading on every screen instead of keeping it:** another phone and Bite could never show it, and the store keeps it only as long as the user does.

## Consequences

- The privacy policy (#44) names these values, and deleting a workout or the account deletes them.
- A user who disconnects keeps what was already kept, as the disconnect sheet says.
