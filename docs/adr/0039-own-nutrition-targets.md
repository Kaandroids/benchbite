# 0039. Let people set their own targets and work the calculated ones out again

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The daily calorie and macro targets are calculated on read from the profile, the goal and the
latest weight (ADR 0009). Nobody could change them afterwards: not to follow a coach's numbers,
and not after their goal, target weight or activity changed since the onboarding (#234).

## Decision

- **Own targets in a table of their own:** `own_nutrition_targets` holds a user's calories,
  protein, carbs and fat, and whether they are in use. Row level security limits it to its
  owner. Leaving them out of use keeps them, so switching back finds the last ones.
- **One rule for which targets count:** `my_nutrition_targets()` returns the own targets when they
  are in use, else the calculated ones. The Nutrition and Today tabs and the amount screens read
  it, so they follow without changes. `calculated_nutrition_targets()` gives the calculated ones
  whichever are in use, for the goals screen.
- **Macros cannot make more than the calories:** at 4, 4 and 9 kcal per gram, allowing 5 % or
  50 kcal for rounding, as a check on the table. Fewer is fine; the rest is left open.
- **Working them out again, as in the onboarding:** the goal, target weight, pace and activity
  can be answered again. `preview_nutrition_targets()` shows the result before it is saved, and
  `recalculate_nutrition_targets()` saves the answers to the goal and the profile in one step and
  puts the calculated targets back in use. The target weight has to lie in the goal's direction
  from the latest weight (`BB031`); a goal that keeps the weight drops the target and the pace.
- **The workout plan stays:** a new goal changes only the nutrition targets. The plan built in
  the onboarding is not built again.

## Alternatives considered

- **Own targets as columns on the profile:** they would mix answers about the person with
  numbers they chose, and the profile's grants and checks would grow for a separate feature.
- **Deleting own targets to go back to the calculated ones:** switching back and forth would
  lose what was typed.
- **Writing the goal and the profile from the app in two updates:** a failure between them would
  leave a goal with the old activity, and the server would not check the target's direction.
- **Building the workout plan again with a new goal:** the plan may have been changed by hand;
  rebuilding it is a separate decision.

## Consequences

- Everything that measures a day against the targets keeps calling `my_nutrition_targets()`.
- Own targets do not follow weight changes; the calculated ones do.
