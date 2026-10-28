# 0042. Count a day for the streak by its workouts and calories, and freeze missed days by choice

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The Today tab shows a streak badge and a mark on each day of the week (#68), but nothing is
recorded yet, so every user has no streak (#70). A streak needs a rule for when a day counts, a way
to keep it over a missed day, and a day boundary. Past days now keep the workouts planned on them
(ADR 0041) and the targets they had (ADR 0040), so a day can be judged by the plan and targets it
had then, not by the ones in use now.

## Decision

- **A day with planned workouts counts when they are done and the calorie target is reached.** Its
  workouts are the ones `planned_workouts()` gives for it, after moves. Both are needed: a workout
  alone or the calories alone do not keep the streak.
- **A day without planned workouts counts when the calorie target is reached.** Rest days keep the
  streak through eating to the target.
- **The calorie target is the day's own**, as `targets_of_day()` gives it (ADR 0040), so a later
  change of targets does not change whether a past day counted.
- **Today is open until it ends:** it adds to the streak once it counts, and does not break it
  before the day is over.
- **Freezes are used by the user, never by themselves.** A missed day breaks the streak. The next
  time the user opens the app, a popup says the streak broke and, when they have freezes, offers to
  use them on the missed days, one freeze for each. Used, the days are frozen and the streak goes
  on; not used, it starts again from zero.
- **Freezes have no limit:** any number can be saved up. How they are earned is decided later.
- **Days follow the device's date,** as meal entries (ADR 0034) and planned days (ADR 0041) do. A
  day is the device's calendar day, and the app sends its today to the functions that judge days.
- **Postgres decides:** tables for frozen days and freezes with row level security, and a function
  that returns the count, whether today counts and the state of each day of a week. The app only
  reads it through a `useStreak()` hook, which replaces the empty streak (`NO_STREAK`).

## Alternatives considered

- **Any activity counts, a workout or a logged meal:** easy to keep, so the streak would say little
  about keeping to the plan.
- **Only workouts count:** rest days would need a rule of their own, and eating would not count at
  all, though the app tracks both.
- **Freezes used automatically on a missed day:** the user would not notice a freeze being spent,
  and could not save it for a day that matters more. Choosing it in a popup makes the miss and the
  freeze visible.
- **A limit on saved freezes:** left out until the way freezes are earned is known; a limit can be
  added then.
- **Days by the server's date or a stored time zone:** the rest of the app follows the device, and
  a day would otherwise end at a different hour than the one the user sees.

## Consequences

- A day needs its entries, its workout logs and its plan to be judged, so the function reads
  `planned_workouts()`, `targets_of_day()`, the logs and the entries together.
- The popup needs to know which days broke the streak since the last visit and how many freezes
  the user has.
- Travelling across time zones can make a day shorter or longer on the device; it is judged as the
  device's day, as every other day is.
- **Open, decided with #70:** what counts as reaching the calorie target (for example within a
  band around it), whether a skipped workout leaves its day without planned workouts or misses it,
  and how freezes are earned.
