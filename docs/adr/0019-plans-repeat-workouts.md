# 0019. Plans repeat a workout on every day of its kind

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

The plan builder (ADR 0010) made one workout for each training day, so up to 6. Without premium a
user may only have a few workouts (ADR 0018), and a plan that alone fills or exceeds the limit
leaves no room for workouts of the user's own.

## Decision

- **One workout per kind:** the plan builder makes each kind of workout in the split once and
  assigns it to every day of that kind. Push, pull and legs on six days are three workouts with two
  days each.
- **At most three kinds:** five days become upper, lower and full body instead of upper, lower,
  push, pull and legs (ADR 0010), so a plan has at most three workouts.
- **The free workout limit is 3**, the most a plan has. This replaces the 5 of ADR 0018. Every
  user can start with the whole plan, and the plan builder is no longer an exception to the limit.
- **The onboarding still shows the week day by day:** the plan, reminder and summary steps list a
  workout once for each of its days.

## Alternatives considered

- **Offering premium for the rest of the plan at the end of the onboarding:** a paywall before the
  app has been tried. Premium is better offered when the limit is reached.
- **A higher limit:** a user with a six-day plan would still have no room left.

## Consequences

- Doing the same workout twice a week makes records and progress (#36, #37) easier to follow.
  The small variation between two sessions of the same kind is lost.
- A plan fills the free limit. A user who wants a workout of their own deletes or replaces one of
  the plan's.
- `complete_onboarding()` takes sessions with weekdays and rejects a plan with more workouts than
  the limit.
