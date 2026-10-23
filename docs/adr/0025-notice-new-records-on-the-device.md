# 0025. Notice new records on the device while logging

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

People want to see when a set beats a record, while they log it and when they finish (#36).
The workout in progress lives on the device and must keep working without a connection
(ADR 0020). Records are calculated in Postgres from the logged sets (ADR 0024), but the sets
of a workout in progress are not logged until it is saved.

## Decision

- **When a workout starts, the app loads each exercise's bests** with `exercise_bests()`,
  which returns the best value of each kind from `exercise_records()`. They are kept with the
  workout on the device.
- **The device compares the done sets with them** and with the sets done before them in the
  same workout. It uses the same kinds of record and the same formulas as the database,
  including Epley's one-rep max rounded to one decimal.
- **A record is noticed only when a best of its kind exists.** An exercise done for the first
  time, or a workout started without a connection, notices none, rather than calling every
  first set a record.
- **Equalling a record is no new record,** as in the database.
- The finish lists the best new record of each kind for every exercise. After saving, the
  records shown elsewhere come from the database again.

## Alternatives considered

- **Asking the database after each set:** needs a connection during the workout, which
  ADR 0020 rules out.
- **Noticing records only after saving:** simpler, but the moment a set beats a record is
  when it means the most.
- **Treating every set of a first-time exercise as a record:** every set would be one, and
  the highlight would mean nothing.

## Consequences

- The formulas live twice, in SQL and in `src/sessions/records.ts`, and must change
  together. Tests on both sides check the same examples.
- A record set on another device during the same workout is not known until the next
  workout starts.
