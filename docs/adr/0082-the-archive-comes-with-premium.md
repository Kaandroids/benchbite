# 0082. The archive comes with premium

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

A free user has room for 3 workouts, and archived ones count toward it (ADR 0018, 0079), so the
archive makes no room and does little for them. When premium ends, archived workouts complicate
what stays: they compete with active ones for the 3 places, and a user asked which workouts to keep
(#411) could spend a place on one they put away.

## Decision

- **`plans.archive` says whether a plan has the archive.** Trial and premium have it; free does not.
  `workout_limits()` gives it to the app.
- **On a plan without it, nothing is moved to the archive:** `set_workout_active()` refuses with
  BB054. A user on the free plan sees the archive and what is in it, and can delete from it.
- **What is in the archive waits for premium,** as `held` (ADR 0079): it cannot be brought back,
  edited or started, and every trigger that protects a waiting workout protects it. It stays
  archived, and is back in the archive with premium.
- **Neither archived workouts nor their alternatives count toward the limits of such a plan:** the
  3 workouts and the 1 alternative are active ones'. So nobody is stuck with a full archive they
  cannot use, and an archived workout never takes the place of an active one.
- **A plan with the archive counts as before,** archived workouts included.

## Alternatives considered

- **Keeping the archive free:** it stays a place to put workouts away, but with no room gained, and
  each archived workout is another case when premium ends.
- **Letting a free user bring workouts back but not archive them:** nobody is stuck either, but they
  could swap a workout in from the archive for one they use, and the archive would be half a feature.
- **Keeping archived workouts in the count, with delete to make room:** fewer changes, but a user
  would have to delete what they would want back with premium.
- **A new flag for "archived and read-only":** waiting already means exactly that, with its triggers.

## Consequences

- A free user cannot lose access to a workout by archiving it, and cannot use the archive to rotate
  workouts around the limit, as nothing goes in or out.
- This amends ADR 0018 and ADR 0079, whose count included archived workouts on every plan.
- `workout_limits()` gives the app the count as well, as `workouts_counted`, so that it counts as
  the limit does; the rule lives in `counts_on_plan()` alone.
- The app shows the archive as read-only and offers premium where it offered moving to the archive.
  Until that change, and in older builds after it, a free user who tries it is refused with BB054
  with no message: the button flips and flips back.
