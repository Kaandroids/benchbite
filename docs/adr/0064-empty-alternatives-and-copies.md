# 0064. A new alternative starts empty; any alternative can be duplicated

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

ADR 0061 added a new alternative as a copy of the one in use, and left "start empty" to the app,
because a workout cannot be saved without an exercise. In use, a copy reads as the same workout
twice: a home version of a gym workout shares few of its exercises, so the user first deletes
them all in Edit (#367). A small variation, such as a shorter day, is still best made from a copy,
and not always of the one in use. The Alternatives sheet also gains choosing the one in use, as
the chips do, so that a new alternative can be put in use right after it is added and filled in
through Edit.

## Decision

- **Add starts empty; Duplicate copies.** `add_workout_alternative()` keeps its parameters and
  takes `source_alternative_id`, an alternative of the same workout, as a last optional one:
  - with it, the new alternative copies that one's exercises, sets and rests; the one in use is
    copied from the workout;
  - with an empty list of `exercises`, the new alternative is empty. It is not tried through
    `save_workout()`, which would refuse it;
  - with a list that has exercises, it is tried through `save_workout()` as before, so that a list
    made elsewhere, such as by Bite, is checked at once;
  - with neither, it is a copy of the one in use, as before, which the sheet uses to duplicate the
    workout before it has alternatives.
    Passing both a source and exercises is refused (`22023`); a source of another workout, or of
    another user's, is not found (`P0002`). The cap of 5 (`BB041`) and the locks are as before.
- **An empty alternative can be in use.** `use_workout_alternative()` puts it in use without
  `save_workout()`: it keeps the days before today, as `save_workout()` does, removes the
  workout's exercises and sets its time to the warm-up alone (5 minutes, as `save_workout()`
  counts it). Saving a workout still needs an exercise, so the only workout without exercises is
  one whose empty alternative is in use, until the user adds one in Edit.
- **The app never starts a workout without exercises.** Wherever a workout shows its size, an
  empty one reads "No exercises yet"; starting it opens the workout screen instead, which explains
  it and leads to Edit. Bite's snapshot marks an empty workout planned today the same way.

## Alternatives considered

- **The editor first, adding the alternative once filled in,** as ADR 0061 left it: the new
  alternative would live only in the editor's draft, unnamed and not in the sheet, and Edit would
  need a second mode that adds rather than saves.
- **A placeholder exercise** so that `save_workout()` accepts an empty alternative: the plan,
  sessions and history would count an exercise the user never chose.
- **Duplicate by sending the source's exercises from the app:** a copy of an alternative not in
  use would first be read and tried through `save_workout()`, whose checks it already passed, and
  the app would hold every alternative's exercises instead of their counts.

## Consequences

- A workout may have no exercises while an empty alternative is in use. The app's sizes and starts
  handle it; a planned day of such a workout still counts as planned, and missed if not done, as
  any other.
- A list of exercises passed to `add_workout_alternative()` is checked as before; only an empty
  one skips the check.
