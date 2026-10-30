# 0061. Alternatives of a workout

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

A user who cannot train in their usual setup, such as on a day the gym is closed, has to edit the
workout or do another one in its place, which the plan does not count as done (#346). Every part
of the app reads a workout's exercises from `workout_exercises`: Today, the plan, sessions, the
history and Bite. The approved design keeps alternatives quiet: a row of name chips at the top of
the workout screen chooses the one in use, and only that screen and its "Manage alternatives"
sheet know about them.

## Decision

- **The one in use is the workout.** Its exercises stay in `workout_exercises`, so nothing that
  reads a workout changes, and editing the workout (`save_workout()`, unchanged) edits it. The
  workout's name and weekdays belong to the workout, not to an alternative.
- **`workout_alternatives` keeps one row per alternative,** the one in use too: its `position`
  (1 to 5, the order of the chips), an optional `name` of up to 12 characters (the app shows an
  unnamed one as "Alternative N"), `in_use`, and the `exercises` of the others as
  `saved_workout()` reads them, null for the one in use. One row per workout is in use. A workout
  without rows has no alternatives and behaves as before; a single row would mean the same, so it
  is never kept.
- **Users read their rows; only functions write them,** with the caller's lock
  (`lock_user_limits()`), then the workout's row, as `save_workout()` takes them:
  - `add_workout_alternative(workout_id, name, exercises, today)` copies the one in use when
    `exercises` is null, or takes the list, which is tried through `save_workout()` and rolled
    back, as Bite's proposals are (ADR 0058), so that its own checks refuse it at once. The list is
    kept as `saved_workout()` reads it back. The first one added also makes the workout's own
    exercises the first alternative, in use. At most 5 per workout (`BB041`), which
    `workout_limits()` now gives with the other limits. "Start empty" is the app's: the editor
    opens without exercises and adds the alternative once they are filled in, as a workout cannot
    be saved without one.
  - `use_workout_alternative(alternative_id, today)` keeps the exercises in use in
    their row and saves the chosen one's through `save_workout()`, with its checks and the days
    kept before the device's today (ADR 0041). A day already past keeps the workout it had.
  - `rename_workout_alternative(alternative_id, name)`: a blank name leaves it unnamed.
  - `reorder_workout_alternatives(workout_id, alternative_ids)` sets the order, naming each
    alternative of the workout once (`22023` otherwise), for the sheet's drag handles.
  - `delete_workout_alternative(alternative_id)` never deletes the one in use (`BB042`); the order
    closes up, and deleting down to one leaves the workout as it is, without alternatives.
- **A switch is permanent until the next one,** as the chips show which one is in use. Sessions,
  records and history see the workout's exercises as they were when done, as with an edit.

## Alternatives considered

- **Versions per day,** chosen on Today for that day only: every reader of a day's workout would
  need the day's version, and Today would gain a switch the design keeps off it.
- **Separate workouts linked to each other:** each would count against the workout limit and the
  plan, and the plan would need a rule for which of them a day expects.
- **A switch on Today:** louder than the design wants; the workout screen is where it is changed.
- **Keeping every alternative's exercises in `workout_exercises`,** with a column naming the
  alternative: every reader would have to filter by the one in use, and `save_workout()` would
  change.

## Consequences

- Nothing outside the workout screen changes, and Bite's proposals change the one in use.
- Exercises of an alternative not in use are kept as JSON, not checked by the foreign keys: if
  one could no longer be saved, putting that alternative in use fails with `save_workout()`'s own
  error and changes nothing.
- A plan slot of the builder's exercises is dropped once they leave use, as `save_workout()` drops
  it on every edit.
