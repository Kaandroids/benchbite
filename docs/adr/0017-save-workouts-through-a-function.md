# 0017. Save workouts through a function that checks their targets

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Users create and edit workouts by hand (#72). A workout and its exercises have to be saved
together. Each exercise's target has to suit what the exercise records (ADR 0008, #36): a rep range
for exercises that record reps, a time for holds, and a time, a distance or both for exercises
that record a distance. Records and logging (#34, #36) rely on that.

## Decision

- **One function writes:** `save_workout()` creates a workout, or replaces the name, weekdays and
  exercises of one of the caller's workouts. It runs with its owner's rights, like
  `complete_onboarding()` (ADR 0013). Users cannot write the tables directly, apart from switching
  a workout on or off and deleting it.
- **Targets follow the metrics:** the function rejects a target that does not suit its exercise.
- **Length:** the function estimates the workout's length with the plan builder's rule. A
  distance without a time counts at 6 minutes a kilometre.
- **Weight is never a target.** It is logged with each set (#34).

## Alternatives considered

- **Direct writes with row level security:** two tables would be written in several requests, so
  a failed request could leave half a workout, and the target rule would have to live in the app.
- **A trigger that checks each exercise row:** keeps the rule in the database, but a workout would
  still be saved in several requests.

## Consequences

- The length rule exists twice, in the plan builder and in SQL. Both say so, and a change to one
  has to be made to the other.
- Saving replaces a workout's exercise rows. When logged sets (#34) refer to them, the function
  will have to keep the rows of unchanged exercises.
