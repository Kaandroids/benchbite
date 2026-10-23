# 0026. Keep custom exercises in the exercises table, with an owner

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

The library (ADR 0008) cannot hold every exercise people do, so users create their own (#33).
A custom exercise has to work everywhere a library exercise does: in workouts, in logs, in
records and progress (ADR 0024), and in the history screen. It may be shared with other people
later, so it should carry the same fields as a library exercise: muscles, equipment, level,
steps and photos.

## Decision

- **A custom exercise is a row of `exercises` with an `owner_id`.** Library exercises have
  none. Workouts, logs, records and progress keep referring to `exercises` by id and need no
  change. Its id is `custom-` and a random UUID, so it never clashes with a library id.
- **Only its owner sees it.** Row level security lets everyone read the library and each user
  their own exercises.
- **Changes go through functions:** `create_exercise`, `edit_exercise` and `archive_exercise`.
  Clients still cannot write to `exercises` directly, so the library stays read-only. The
  functions check the fields: a name, one of the four ways of logging the app offers, one to
  five main muscles, and at most twenty steps. They also cap a user at 500 exercises.
- **What it records is fixed once it has logged sets.** Changing it then would leave sets that
  no longer suit it. The name, muscles, equipment, level and steps can always change.
- **Archiving replaces deleting.** An archived exercise leaves the lists, while its history,
  records and progress stay. It can be brought back.
- **A row of a workout or a log may only name its own user's custom exercises.** Those rows are
  saved by functions that bypass row level security, so a trigger checks it.

## Alternatives considered

- **A separate `custom_exercises` table:** every reference to an exercise (workouts, logs,
  records, plans) would need two foreign keys or a union, and every query both tables.
- **Writes through row level security policies:** possible, but the checks of what an
  exercise records and of its fields belong in one place, and the library must stay read-only
  whatever a policy says.
- **Deleting a custom exercise with its sets:** simpler, but it would silently change past
  workouts and their totals.

## Consequences

- Sharing an exercise later means widening the read policy, for example to exercises a user
  follows, without moving any data.
- Names of custom exercises are in the language the user typed them. There are no translations.
- The library import (`scripts/import-exercises.ts`) upserts library ids, which never clash with
  `custom-` ids.
