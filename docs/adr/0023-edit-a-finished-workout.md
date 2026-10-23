# 0023. Edit a finished workout by replacing its sets

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

A finished workout is saved with all its sets at once (ADR 0020), and until now could only be
deleted. People notice a mistake afterwards: a weight typed wrong, a set ticked by accident, a set
done but not logged. Records and progress (#36, #37) will be built from these sets, so a mistake
should be fixable.

## Decision

- **`edit_workout_log()` replaces all the sets of a log** in one transaction. The app sends the
  whole edited list in `log_workout()`'s shape, and the sets are checked the same way.
- **Only the sets change.** When the workout was done, what it had when it started and its
  estimated calories (ADR 0021) stay as they were.
- **A log keeps at least one set.** Removing every set is rejected; the log is deleted instead.
- **Skipped exercises can get sets afterwards.** A log keeps each exercise's place in the workout,
  so the edit screen shows the workout's exercises that have no sets in their places. Exercises
  without sets are sent too and save nothing, so the others keep their places.

## Alternatives considered

- **Updating, inserting and deleting single sets:** the app would have to track what changed,
  and a half-done edit could leave the log in between. The whole list is small, so replacing it
  is simpler.
- **Editing the time as well:** the calories are estimated from it, so they would have to be
  estimated again from today's weight, not the weight at the time. Left for later.

## Consequences

- An edit replaces the sets, so they get new ids. Nothing refers to a set's id.
- An edit needs at least one set to be saved; a whole workout is removed with its delete button.
