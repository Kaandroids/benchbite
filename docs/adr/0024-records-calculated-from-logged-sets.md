# 0024. Calculate records from the logged sets when they are read

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

People want to see their records and how an exercise is progressing (#36, #80). Exercises record
different things (ADR 0008): weight and reps, reps alone, a time, a distance or a distance and a
time. The sets that records come from can be edited after a workout is saved (ADR 0023), and
records must be the same on every device.

## Decision

- **Records are calculated in Postgres from the logged sets whenever they are read.**
  `exercise_records(exercise_id)` returns one row for each kind of record the caller has, and
  `exercise_progress(exercise_id)` sums up the exercise for each workout it was done in, for the
  chart.
- **The kinds of record follow what the exercise records,** from a fixed catalogue:
  - weight and reps: the heaviest set, the best estimated one-rep max, the best set (weight × reps)
    and the most reps;
  - reps alone: the most reps, and the heaviest added weight;
  - a time: the longest set, and the most time in one workout;
  - a distance: the longest set, and with a time the fastest pace.
- **A record is the first time its best value was reached.** Equalling it later does not take it
  over.
- **The one-rep max is estimated with Epley's formula,** weight × (1 + reps / 30). A single rep is
  its own one-rep max.
- **Both functions run with the caller's rights,** so Row Level Security keeps each user to their own
  sets.

## Alternatives considered

- **Storing records in a table, updated by a trigger when sets are saved:** faster to read, but an
  edited or deleted log would have to recalculate them, and two places could disagree. A user's
  sets of one exercise are few, so calculating on read is fast enough.
- **Calculating in the app:** business logic lives in Supabase, and every device would need the
  same code.
- **Other one-rep max formulas (Brzycki, Lombardi):** they differ little below ten reps; Epley is
  common and simple.

## Consequences

- Records always match the logged sets, including after an edit or a deleted workout.
- Custom exercises (#33) will choose their kinds of record from the same catalogue. Assisted
  exercises, where less weight is better, wait until the library marks them.
- If reading records gets slow with many sets, the functions can move to a cached table without
  changing what they return.
