# 0069. A log keeps the alternative it was done with

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

A workout can have alternatives, such as one for the gym and one for home, of which one is in use
(ADR 0061). Records and "last time" are per exercise, whichever alternative it was done in, and stay
so: the same exercise is the same lift at home and in the gym. The history, though, shows a finished
workout only by its name, so a user cannot tell which days they trained at home (#346).

## Decision

- **`workout_logs` keeps `alternative_name` and `alternative_position`,** the name, if any, and the
  place of the alternative in use when the log is saved. The app shows them after the workout's name
  in the muted colour, "Upper body · Home", or "Alternative 2" for an unnamed one, as its chip does.
  Both are null for a workout without alternatives and for logs saved before.
- **A trigger copies them on insert,** from the workout's alternative in use, so `log_workout()`
  does not change and the app sends nothing more: a workout's exercises are always those of the
  alternative in use. An edited log keeps what it had.
- **They are a copy,** so renaming, reordering or deleting the alternative later leaves the history
  as it was, as the log keeps the workout's name.
- `workout_log_summaries` gains both columns at the end.

## Alternatives considered

- **The app sends the alternative with the log:** one more field to check and nothing gained, as the
  server knows which one is in use.
- **A reference to the `workout_alternatives` row:** deleting an alternative would lose it, and a
  rename would change past logs.
- **Records per alternative:** would split the records of the same exercise between home and gym.

## Consequences

- A switch made while a workout is running names the log after the alternative in use when it is
  saved, not the one it started with.
- Logs saved before have no alternative, even if their workout had one.
