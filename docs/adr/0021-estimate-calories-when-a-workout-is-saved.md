# 0021. Estimate the calories of a workout when it is saved

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

The history and the workout list show the calories a workout burns. Most users have no watch,
so the calories are estimated. A watch's measurement will replace the estimate later (#85).

A finished workout's history must not change afterwards, for example when the user adds or
corrects a weight.

## Decision

- **5 METs for strength training:** a minute burns 5 × body weight in kg / 60 kcal. One function
  in the database holds the formula, `strength_kcal_per_minute()`, and
  `my_strength_kcal_per_minute()` applies it to the caller's latest weight.
- **Finished workouts keep their estimate:** `log_workout()` estimates the calories from the
  workout's length and the latest weight when it is saved, and stores them on the log. They never
  change afterwards.
- **Planned workouts are estimated** from their estimated length and the latest weight, so
  their estimate follows the user's weight.
- **No weight, no estimate:** the calories are left out rather than guessed.

## Alternatives considered

- **Estimating on reading, from the weight on the workout's day:** past workouts would change
  when an older weight is added or corrected, and dates in different time zones could pick the
  wrong day's weight.
- **A MET value per exercise:** more exact, but the exercise library has none, and the whole
  workout's time includes rests.
- **Estimating in the app:** the history and the planned workouts would need the formula twice.

## Consequences

- The estimate is rough: it ignores how hard the sets were.
- Logs saved before this have no calories.
