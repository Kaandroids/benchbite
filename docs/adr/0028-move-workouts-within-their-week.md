# 0028. Move workouts within their week, with several workouts a day

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

A workout is planned on weekdays (ADR 0016), and the week is the active workouts on theirs. Weeks
rarely go as planned: a workout is missed, done a day early, or has to give way to something else
that day. Until now the app had no way to say so. A workout done on another day did not count for
the day it was planned on, and the week card counted days with any workout against planned
workouts, so it could read "2 of 1".

Several active workouts can share a weekday, such as cardio in the morning and weights in the
evening, but the app treated a day as one workout: the Today card showed one of them and the week
card ticked the day once any was done.

Days follow the device's date, as weight entries do, so only the device knows which day a workout
started on in the user's time zone.

## Decision

- **A move applies to one week, not to the workout.** A `workout_moves` row takes a workout from a
  planned day (`from_on`) to another day of the same week (`to_on`). The workout keeps its
  weekdays, so the next week is planned as before. Weeks run Monday to Sunday, and moves never
  cross them.
- **A skip is a move without a target.** Skipping a missed workout is stored like a move, so the
  question is not asked again on any device, and a deliberate skip can be told apart from a missed
  workout later (#70).
- **A day can hold several workouts.** A planned workout is done when a log of that workout
  started on that day. A day is done when all its workouts are, and progress counts planned
  workouts, not days. A log of a workout that is not planned that day is an extra workout: it
  shows, but does not count towards the week. A skipped workout does not count either, so a day
  or a week can be complete without it; it still shows as skipped, apart from a missed one.
- **The database enforces what a move may be.** `move_workout()` checks that the original day is
  one of the workout's weekdays, that the target is in the same week, not in the past and does not
  already have the same workout. A move is undone by deleting it, which the database allows at
  any time.
- **A move chosen when starting is saved with the log.** Starting a workout that is not planned
  today asks whether it replaces a missed or a later planned day. The answer stays with the session
  on the device and `log_workout()` writes the move in the same transaction, so it works offline
  and an abandoned session leaves no move behind. The move is judged on the day the workout
  started, so a log saved days later keeps it.
- **The device works out the week.** `weekSchedule()` combines the plan, this week's moves and logs
  into each day's workouts and their states, in the device's time zone. Today, the week card and
  the next workout all use it. Moves that no longer fit the plan, because the workout's weekdays
  changed or it was archived, are ignored. The app offers to undo a move only until its workout
  is done, as only the device knows which day a workout counts for.

## Alternatives considered

- **Changing the workout's weekdays:** a missed Monday moved to Wednesday would then stay on
  Wednesday every week, which is rarely meant. The user would have to move it back.
- **Recording on the log which day it counts for, without moves:** this covers a workout done on
  another day, but not moving one ahead of time, nor skipping one.
- **One planned workout per day:** simpler to count and to move, and a second workout could still
  be logged as an extra. Rejected because training twice a day is a common plan that should count
  towards the week.
- **Working out the week in a database function:** the function would need the device's time zone
  for every call, and the result depends on the device's date anyway. The database keeps the rules
  that must hold for every client; the counting stays next to the screens that show it.

## Consequences

- Today lists the day's workouts instead of showing one, and the week card shows how many of a
  day's workouts are done.
- Every screen that shows the week reads the moves of the current week, one more small query.
- Reminders still follow the weekdays until they learn about moves (#143).
- Streaks (#70) can build on the same states: done, missed, moved and skipped.
