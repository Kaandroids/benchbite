# 0043. Page the week strip back to the account's first week, to read only

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

The week strip on the Today tab shows the current week only. The user wants to look back at how
past weeks went (#71): which days counted for the streak, which were frozen and which were missed
(ADR 0042). Past days keep their planned workouts (ADR 0041), so a past week can be shown as it
was planned.

## Decision

- **Whole weeks:** the strip pages back one week at a time, Monday to Sunday, as the current week
  is shown.
- **Back to the account's first week, never forward:** the first week is the one the plan started
  in (`complete_onboarding()`, ADR 0041). Future weeks are not shown; today's week is the last.
- **Only the calendar:** a past week shows its days with their streak marks and planned workouts,
  as the strip does now. Tapping a past day opens nothing more.
- **History stays where it is:** what was done on a day is read in the workout history and the
  nutrition day, each by the day, not from the strip.

## Alternatives considered

- **Scrolling freely day by day:** a week would rarely line up with the screen, and the strip is
  read as a week.
- **Opening a day's details from the strip:** it would repeat the workout history and the
  nutrition day in a third place.
- **Paging forward to planned weeks:** future days only repeat the plan as it is, which the
  workouts already show.

## Consequences

- The strip needs each past week's planned workouts and streak states, read with
  `planned_workouts()` and the streak function for the week shown.
- Weeks before the account's first week cannot be reached, so they need no empty state.
- The design is approved as an Artifact before it is built.
