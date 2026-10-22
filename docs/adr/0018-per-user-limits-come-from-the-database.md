# 0018. Per-user limits come from the database

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

A workout may have a limited number of exercises. The limit was 20 for everyone. Without premium
it is now 10, and premium will raise it. More limits like this are likely, for example the number
of active workouts.

The app has to know the limit to stop users before they save, and `save_workout()` (ADR 0017) has
to enforce it.

## Decision

- **The database decides:** `max_workout_exercises()` returns the caller's limit, and
  `save_workout()` checks the workout against it. For now it returns 10 for everyone; once premium
  exists it will look at the caller's subscription.
- **The app asks:** the app calls the function and does not know the number itself. The picker
  stops at the limit, and the editor says why a workout cannot be saved.
- **Plans fit the free limit:** the plan builder's workouts stay within 10 exercises, so that every
  user can edit them. `FREE_WORKOUT_EXERCISES` in the shared plan limits says so, and
  `pnpm check:plans` checks it.

## Alternatives considered

- **A constant in the app:** a new limit would need an app update, and the app could not tell a
  premium user from a free one.
- **A limits table:** more flexible, but there is only one limit and no premium yet. A function
  can later read from a table without the app noticing.

## Consequences

- Raising a limit, or making it depend on premium, only needs a migration.
- The free limit is written twice, in `max_workout_exercises()` and in the plan builder's limits.
  Both mention the other.
- Workouts saved earlier with more than 10 exercises can still be opened, but must be shortened
  before they are saved again.
