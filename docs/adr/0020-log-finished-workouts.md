# 0020. Log a workout once it is finished

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Users log their sets during a workout (#34): the weight and reps, a time or a distance, as the
exercise records them (ADR 0008). Records, progress and streaks (#36, #37, #70) are built from what
was logged. A gym often has a poor connection, and a workout can last an hour or more.

## Decision

- **A workout in progress lives in the app.** Its sets are kept on the device while it runs, so a
  lost connection or a closed app loses nothing.
- **A finished workout is saved at once:** `log_workout()` writes the log and all its sets in one
  transaction, or nothing. Exercises without sets are left out, so a workout can be finished early.
- **Logs keep the workout's name and type** as they were, and outlive the workout: deleting a
  workout keeps its logs.
- **Sets are checked against the exercise:** reps only where the exercise records reps, a weight
  with reps (added weight for bodyweight exercises), a time where it records a duration, a
  distance where it records one.
- **Users read and delete their logs** and never write them directly. `last_sets()` returns the
  sets of each exercise's latest log, for "last time" while logging.

## Alternatives considered

- **Saving each set as it is done:** the workout would be on the server at once, but every set
  would need a connection, and a half-saved workout would have to be cleaned up or resumed.
- **Logs that point to the workout for their name:** a renamed or deleted workout would change or
  lose its history.

## Consequences

- A workout in progress is lost if the app's data is deleted before it is finished.
- Editing a logged workout means a new function; for now a log can only be deleted.
