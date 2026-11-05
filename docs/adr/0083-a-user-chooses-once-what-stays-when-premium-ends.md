# 0083. A user chooses once what stays when premium ends

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

When premium ends, the workouts last trained and the alternatives last used stay, up to the free
limits, and the rest wait (ADR 0079). The user could not choose others, as a swap at any time would
let a free user rotate through many workouts: the limit would hold only for how many are usable at
once, not which. But the ones last trained are not always the ones a user wants to keep, as with a
workout they only did last week because of travel.

## Decision

- **A user chooses once for each premium that ends.** `applied_plans.choice_open` says the choice is
  theirs. `apply_plan_limits()` opens it when a plan with more room ends and something waits, and
  closes it when nothing is left to choose between. Only the next end of a plan opens it again.
- **`choose_what_stays(workouts, alternatives)` makes the choice** and closes it. It takes as many
  active workouts as the plan has room for, or all there are, and likewise the alternatives of those
  workouts. It refuses when there is no choice to make (BB055) and what does not fit the plan (BB056).
- **Until then the automatic rule holds:** the ones last trained and used stay, so a user who never
  chooses keeps working, and `workout_limits()` gives the app `choice_open` so that it can ask.
- **What is in the archive is not among the choices** (ADR 0082): it stays as it is.
- Users who already wait for premium when this arrives get the choice too, as they have not had it.

## Alternatives considered

- **No choice:** the plain rule of ADR 0079, with nothing to build, but a user may feel a workout was
  taken from them and has no way to change that but premium.
- **A choice at any time:** kinder still, but it is the rotation ADR 0079 rejected.
- **A time limit on the choice:** it would add a rule to explain and a date to keep, and an open
  choice gives nothing away, as it can be made only once.
- **Choosing before premium ends:** a user would have to act on a plan they have not left, and many
  would not.

## Consequences

- The rule that a plan never trades one workout for another still holds for `apply_plan_limits()`;
  `choose_what_stays()` is the one place that does.
- A user could trial premium again to choose again only by paying for it, as the trial is offered
  once, so a new choice comes with a new paid period.
- This amends ADR 0079, whose users could not choose.
- The app asks in the Workouts tab, each time until the choice is made; that comes with its own
  change.
