# 0009. Calculate nutrition targets in Postgres on every read

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The onboarding ends with daily calorie and macro targets. They depend on the profile, the goal
and the current weight, and the weight changes over time. Business logic lives in Supabase, the
targets have to be shown before the onboarding is saved, and they must be safe for everyone who
enters their data, including people who should not diet.

## Decision

- **Where:** a Postgres function, `calculate_nutrition_targets()`, takes the answers as
  arguments and touches no table, so the plan reveal can call it before saving.
  `my_nutrition_targets()` runs it on the current user's saved data, with row level security
  applying.
- **When:** targets are calculated on every read and not stored, so they always follow the
  latest weight entry, goal and profile. Targets set by hand, if they come, will be stored as an
  override.
- **Model:**
  - Basal metabolic rate by Mifflin-St Jeor; "prefer not to say" uses the midpoint of the
    female and male constants.
  - Activity factors of 1.2, 1.375, 1.55 and 1.725. The activity answer covers daily movement
    outside workouts, so 2 to 4 training days a week raise it one step and 5 or more two steps.
  - A deficit or surplus from the weekly pace at 7700 kcal per kilogram, capped at 1000 kcal
    and 500 kcal a day. Without a pace, 0.5 kg a week of loss and 0.25 kg of gain are assumed.
    Getting stronger and staying healthy keep maintenance calories.
  - No deficit or surplus during pregnancy or breastfeeding, or when the target weight lies on
    the wrong side of the goal.
  - Floors of 1200 kcal for women, 1500 kcal for men and 1350 kcal for "prefer not to say".
  - Protein of 1.8 g per kilogram, from the lower of the current and target weight when losing
    fat, and at most 40 % of the calories. Fat is 25 % of the calories, carbohydrates fill the
    rest, so the macros always add up to the calories.
- **Tests:** pgTAP tests check reference values and the safety rules, and run in CI.

## Alternatives considered

- **Calculating in the app:** quicker to show, but business logic belongs in Supabase, and the
  targets must follow weight changes that may happen outside the app.
- **Storing targets and recalculating them in a trigger:** faster reads, but every input table
  would need a trigger, and a missed one would leave stale targets.
- **An Edge Function:** easier to unit-test in TypeScript, but the calculation needs only data
  that is already in Postgres, and a function there can be called from SQL as well.

## Consequences

- The 7700 kcal rule is a static estimate that ignores metabolic adaptation, so real progress
  is slower than projected at larger deficits. The caps keep the targets safe, and a dynamic
  model can replace the function later without changing its callers.
- The results are estimates and not medical advice; the app has to say so.
