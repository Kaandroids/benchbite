# 0022. Workouts have no finisher

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

The plan builder (ADR 0010) ended fat loss workouts with a few minutes of conditioning, kept as a
"finisher": a mark on the exercise, a section of its own on the workout screen, and a field of
its own in the app. It behaved like any other exercise when it was logged or edited, but some
screens counted it as an exercise and some did not.

## Decision

- **No finisher:** the conditioning is an ordinary exercise, the last of the workout. The plan
  builder still adds it for fat loss, and users can move, change or remove it like any other.
- **The mark goes:** `workout_exercises.is_finisher` is dropped. Finishers saved before were
  already the last exercise.
- **Sections later, if at all:** parts of a workout with a behaviour of their own, such as a
  warm-up whose sets do not count towards records, may come back as a general feature.

## Alternatives considered

- **Keeping the finisher:** a name for something that behaves like everything else, and a source
  of different counts on different screens.
- **Making every workout's last exercise its finisher:** the last exercise is often not
  conditioning, and the name would still change nothing.

## Consequences

- Every screen counts the same exercises.
- A fat loss plan's conditioning no longer stands out on the workout screen.
