# 0099. Read a workout's health again for a day

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

ADR 0098 keeps a summary of what a watch measured on a workout. Its decision had the app send only the values a log still lacked, so that a later read could not overwrite a full one. Watch apps write to the phone's health store in parts: a workout saved at once, before its last minutes reached the store, would keep the first partial read for good, which ADR 0098 itself rejects among its alternatives. Phones also count some active calories from motion alone, without a watch, and sensors give the odd spike.

## Decision

- **For a day after a workout, every read is kept.** Each time the app comes to the front, the logs of the last day are read again, and what each read found is sent. `set_workout_health()` keeps what a read did not find, so a read that finds nothing wipes nothing; the last read that found a value wins. This replaces ADR 0098's "only the values still missing".
- **A read counts only with a heart rate a person can have.** Its calories are kept only with it, so the few a phone counts from motion never stand in for the estimate, and a spike beyond 250 bpm leaves the whole read out rather than being sent again and again.
- **One catch-up at a time,** however often the app comes to the front.

## Alternatives considered

- **Sending only the missing values** (ADR 0098): it keeps a partial first read for good.
- **Keeping the larger of two reads:** a partial read cannot be told from a light workout.
- **Calories without a heart rate:** a phone's motion count would show as the watch's.

## Consequences

- Another phone whose store holds less, reading within the day, can replace a fuller value; after a day, nothing changes.
- A workout without a watch keeps the estimate, and shows no watch figures.
