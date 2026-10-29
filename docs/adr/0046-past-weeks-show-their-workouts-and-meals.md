# 0046. A past week shows its workouts, its days' macros and a summary

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

ADR 0043 pages the Today tab's week strip back to the account's first week, showing only the
calendar: a past week's days with their streak marks. What was done on a day stayed in the
workout history and the nutrition day. Looking back a week, though, the user wants to see how it
went at a glance, without opening a history day by day (#71). The streak judges a day by its
workouts and calories (ADR 0042, ADR 0044), so the week should show both.

## Decision

- **A past week shows three cards under its strip,** where the current week shows today's cards:
  - **Workouts:** the workouts done that week, each with its day, length and weight lifted, and
    the ones missed.
  - **Calories and macros:** each day as a bar of its protein, carbs and fat, with its calories
    over it, in the macros' colours; a day over its target is marked, a day without entries left
    empty.
  - **Week summary:** the calories eaten against the targets of the days logged, as one bar, and
    protein, carbs and fat each against their targets with their average a day.
- **Days read as they were kept:** each day's targets are the ones it kept (ADR 0040), from
  `days_nutrition(from_day, to_day, today)`, which sums each day's entries with its targets for up
  to a month of days.
- **The strip itself stays as ADR 0043 says:** whole weeks, back to the first week, never
  forward, and a day opens nothing.

This replaces ADR 0043's "Only the calendar" and "History stays where it is".

## Alternatives considered

- **Only the calendar, as ADR 0043 had it:** the user would open the history and each nutrition
  day to see how a week went.
- **Each day's calories and macros as a list:** precise, but a long list for a glance.
- **Calories as bars against the target, with the average macros under them:** it shows which
  days kept their target, but not how each day's macros were made up; the target line is in the
  summary instead.
- **The week's targets over all seven days:** a day not logged would count as eaten nothing and
  make the week look short; only the days logged count.

## Consequences

- The Today tab loads the week's planned workouts, moves, logs, streak states and nutrition for
  the week shown.
- The workout history and the nutrition day stay the place to change what was logged.
