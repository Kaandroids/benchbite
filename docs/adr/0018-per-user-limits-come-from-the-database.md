# 0018. Per-user limits come from the database

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Without premium, a user may have up to 5 workouts with up to 20 exercises each. Premium will
raise these limits, and more limits like them are likely.

The app has to know the limits to stop users before they save, and `save_workout()` (ADR 0017) has
to enforce them.

## Decision

- **The database decides:** `workout_limits()` returns the caller's limits, and `save_workout()`
  checks against them. For now it returns the free limits for everyone; once premium exists it
  will look at the caller's subscription.
- **The app asks:** the app calls the function and does not know the numbers itself. The workout
  list stops offering new workouts at the limit, the picker stops at the exercise limit, and the
  editor says why a workout cannot be saved.
- **Every workout counts:** archived workouts count towards the workout limit, so archiving is not
  a way around it.
- **Plans fit the free exercise limit:** the plan builder's workouts stay within 20 exercises, so
  that every user can edit them. `FREE_WORKOUT_EXERCISES` in the shared plan limits says so, and
  `pnpm check:plans` checks it. The plan builder is not held to the workout limit: a plan has a
  workout for each of up to 6 training days.

## Alternatives considered

- **Constants in the app:** a new limit would need an app update, and the app could not tell a
  premium user from a free one.
- **A limits table:** more flexible, but there are only two limits and no premium yet. The
  function can later read from a table without the app noticing.
- **Counting only active workouts:** archiving would get around the limit.

## Consequences

- Raising a limit, or making it depend on premium, only needs a migration.
- The free exercise limit is written twice, in `workout_limits()` and in the plan builder's
  limits. Both mention the other.
- A user whose plan has 6 workouts has more than the free limit and cannot create another one
  until they delete one.
