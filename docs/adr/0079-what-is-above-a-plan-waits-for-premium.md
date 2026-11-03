# 0079. What is above a plan's limits waits for premium

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

ADR 0078 gives each plan its workout limits: free has 3 workouts and 1 alternative in all, premium
500 workouts and 5 versions of each. When premium ends, nothing is deleted: what is above the free
limits waits for premium and comes back with it. The same holds for the free limit on alternatives
when it first applies, as every workout could have 5 versions before. ADR 0078 left how waiting is
stored, and how it differs from what the user archived, to this decision.

## Decision

- **Waiting is a flag of its own:** `workouts.held` and `workout_alternatives.held`, apart from
  `workouts.active`, which stays the user's choice to archive. A workout that comes back with
  premium is active or archived as it was.
- **What waits:** when a user has more workouts than their plan allows, archived ones included, the
  ones they last trained stay usable, active before archived, up to the limit; the rest wait. Of the
  alternatives that are not in use, the ones last in use stay usable, up to the versions a workout
  may have and the alternatives a user may add; the rest wait, and so do all of a waiting workout's.
  The version in use is the workout itself and never waits.
- **The user cannot choose others:** a waiting workout can be seen and deleted, nothing else. It
  cannot be edited, archived or brought back, and the app does not start it; the same holds for a
  waiting alternative, which cannot be put in use or renamed. A workout already under way when it
  began to wait is still saved: the database sees a workout only at its end, and refusing it then
  would lose what the user did. Choosing which ones stay would let a free user rotate through many
  workouts.
- **Waiting counts toward the limits,** as archived workouts do (ADR 0018), so that a free user with
  more than 3 workouts adds a new one only after deleting some.
- **A waiting workout is not planned:** its days stay on it and come back with it, but no day plans
  it meanwhile.
- **The database enforces it,** with triggers on the tables rather than a check in each function,
  so that every way a workout or alternative changes, the coach's included, is held to it.
- **When it runs:** `apply_plan_limits()` holds what is above the user's plan and lets it go when
  everything fits again. It runs when a subscription is given, changes or goes; after a workout or
  alternative is deleted, which may make everything fit; and every ten minutes for the users whose
  plan differs from the one last applied (`subscriptions.applied_plan`), which catches a plan whose
  end has passed without going through every subscription. This migration runs it once for
  everyone, for the new free limit on alternatives. It only holds while more is usable than the plan
  allows and only lets go when everything fits, so it never trades one workout for another.
- **The limits come from `plans`:** `workout_limits()` reads the caller's plan, and gives the
  alternatives a user may add in all with the others.

## Alternatives considered

- **Archiving what is above the limit:** one flag fewer, but what comes back with premium could not
  be told from what the user archived, and a user could unarchive it.
- **Locking rather than holding, in the app only:** the database would still accept a call that
  edits or starts a waiting workout, from an old app or the coach.
- **Letting the user choose which workouts stay:** kinder, but with a swap at any time the free
  limit would hold only for how many workouts are usable at once, not which.
- **Downgrading only in the functions that check limits:** exact to the second, but a user who does
  not open the app would keep using premium's workouts on another device until they did.

## Consequences

- The app shows waiting workouts and alternatives as locked, with a way to premium, and does not
  start a waiting workout; that design comes with its own change. Until then they look as before,
  and the database refuses changing them with BB051, and adding an alternative above the limit in
  all with BB052.
- A plan's end takes effect up to ten minutes after its hour of grace.
- `apply_plan_limits()` is the one place that knows the ranking; a plan with other limits needs no
  change to it.
- This amends ADR 0018, whose limits were the same for everyone, and ADR 0061, whose 5 versions
  per workout are now premium's.
