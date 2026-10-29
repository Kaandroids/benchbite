# 0042. Count streak days by workouts and calories, and freeze by choice

- **Status:** Accepted, calorie rule amended by ADR-0044
- **Date:** 2026-10-29

## Context

The Today tab shows a streak badge and a mark on each day of the week (#68), but nothing is
recorded yet, so every user has no streak (#70). A streak needs a rule for when a day counts, a way
to keep it over a missed day, and a day boundary. Past days now keep the workouts planned on them
(ADR 0041) and the targets they had (ADR 0040), so a day can be judged by the plan and targets it
had then, not by the ones in use now. Meals can still be logged up to a week back
(`check_meal_day()`, ADR 0034), and finished workouts can be changed (ADR 0023), so a past day's
result can change for a while.

## Decision

- **A day with planned workouts counts when they are done and the calorie target is reached.** Its
  workouts are the ones `planned_workouts()` gives for it, after moves. Both are needed: a workout
  alone or the calories alone do not keep the streak.
- **A day without planned workouts counts when the calorie target is reached.** Rest days keep the
  streak through eating to the target.
- **Moving a workout keeps the streak, skipping it breaks it.** A workout moved to another day of
  its week counts on the day it moved to (ADR 0028); a skipped workout leaves its day missed.
- **Only the calories count:** the day is judged by its calorie target, as `targets_of_day()` gives
  it (ADR 0040), not by its macros. It is reached when the calories eaten are within 10 % of it,
  above or below. A later change of targets does not change whether a past day counted.
- **Today is open until it ends:** it adds to the streak once it counts, and does not break it
  before the day is over.
- **Freezes are used by the user, never by themselves.** The next time the user opens the app
  after a day that did not count, a popup says the streak broke, points to the days that can still
  be logged, and, when the user has a freeze for every one of those days, offers to use them, one
  each. Used, the days are frozen and the streak goes on; declined, it starts again from zero.
  With fewer freezes than missed days, none is offered, as some could not save the streak.
- **A day's result becomes final** once the popup for it is answered, either way, or once it can
  no longer be logged, a week after it. Final days are kept with their result, so a meal logged or
  deleted later does not change the streak. Days still open are worked out when read.
- **Every user starts with 3 freezes,** existing users too, and can save up any number. How more
  are earned is decided later, in an ADR of its own.
- **Days follow the device's date,** as meal entries (ADR 0034) and planned days (ADR 0041) do. A
  day is the device's calendar day, and the app sends its today to the functions that judge days.
- **Postgres decides:** tables for the kept days with their result (counted, frozen or missed),
  the freezes each user has, and the day through which breaks are answered, all with row level
  security. Clients only read them; only functions that run with their owner's rights for the
  caller write them, and they check the user's freezes before using any. A function returns the
  count, whether today counts and the state of each day of a week. The app reads it through a
  `useStreak()` hook, which replaces the empty streak (`NO_STREAK`).

## Alternatives considered

- **Any activity counts, a workout or a logged meal:** easy to keep, so the streak would say little
  about keeping to the plan.
- **Only workouts count:** rest days would need a rule of their own, and eating would not count at
  all, though the app tracks both.
- **The macros count too:** hard to reach all four every day, and the calories already follow from
  them.
- **Skipping keeps the streak, as moving does:** skipping every planned workout would keep it
  without training.
- **Freezes used automatically on a missed day:** the user would not notice a freeze being spent,
  and could not save it for a day that matters more. Choosing it in a popup makes the miss and the
  freeze visible.
- **Working every day out on each read:** a meal logged or deleted on an old day would mend or
  break the streak after the popup was answered, and each read would walk back through every day's
  plan, targets, logs and entries.
- **Days by the server's date or a stored time zone:** the rest of the app follows the device, and
  a day would otherwise end at a different hour than the one the user sees.

## Consequences

- Judging a day reads `planned_workouts()`, `targets_of_day()`, the workout logs and the entries
  together; keeping final days means each is judged once.
- A day that did not count still asks to be logged in the popup, so a meal forgotten yesterday can
  mend it before any freeze is spent.
- Travelling across time zones can make a day shorter or longer on the device; it is judged as the
  device's day, as every other day is.
- The band of 10 % is a starting point and can be tuned.
