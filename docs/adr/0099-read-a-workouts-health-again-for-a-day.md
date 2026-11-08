# 0099. Read a workout's health again for a day

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

ADR 0098 keeps a summary of what a watch measured on a workout. Its decision had the app send only the values a log still lacked, so that a later read could not overwrite a full one. Watch apps write to the phone's health store in parts: a workout saved at once, before its last minutes reached the store, would keep the first partial read for good, which ADR 0098 itself rejects among its alternatives. Phones also count some active calories from motion alone, without a watch, and sensors give the odd spike.

## Decision

- **For a day after a workout, every read is sent.** Each time the app comes to the front, the logs of the last day are read again and each read is sent, one catch-up at a time. A value the read did not find keeps what was kept, so a read that finds nothing wipes nothing; the last read that found a value wins. This replaces ADR 0098's "only the values still missing".
- **`set_workout_health()` decides what of a read counts,** in the database, as business rules do: a read counts only with a heart rate a person can have, as a pair, and its calories only with it. A read without one, or with a value no person can have such as a sensor's spike, changes nothing. It answers whether it changed anything, so that the app reloads its screens only then.
- **Calories come from the apps that measured the heart rate.** A phone counts some from motion alone, which no watch measured: the app reads the calories of the heart rate's sources only, on iOS by source and on Android by data origin.
- **Saving a workout and keeping its read are two calls.** `log_workout()` stays as it is; a read that fails to be kept is sent again by the catch-up within the day.
- **The app shows only what the function would keep,** with the same ranges, rounded as it rounds.

## Alternatives considered

- **Sending only the missing values** (ADR 0098): it keeps a partial first read for good.
- **Keeping the larger of two reads:** a partial read cannot be told from a light workout.
- **Calories without a heart rate, or of every source:** a phone's motion count would show as the watch's.
- **The read inside `log_workout()`:** one call, but a change to a function the whole history depends on, for a value the catch-up keeps anyway.
- **The rule in the app:** it would repeat the function's ranges, and differ from them.

## Consequences

- Another phone whose store holds less, reading within the day, can replace a fuller value; after a day, nothing changes.
- A workout without a watch keeps the estimate, and shows no watch figures.
