# 0044. Count a day's calories up to its target, and keep the device's day of each workout

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

ADR 0042 counts a day for the streak when its planned workouts are done and its calories are
within 10 % of its target. Building it (#70) raised two points. A band around the target counts a
day eaten over it, though the target is the most a user means to eat. And a finished workout
keeps only the moment it started, so the server cannot tell on which of the device's days it was
done: a workout started at half past midnight in Berlin is the day before in UTC.

## Decision

- **The calories count when more than none and no more than the day's target were eaten.** This
  replaces the band of 10 % in ADR 0042. A day without any entries is missed, as is a day over its
  target.
- **A finished workout keeps the device's day it started on** (`workout_logs.started_on`), as meal
  entries keep theirs (ADR 0034). `log_workout()` takes it as `startedOn`, within a day of the
  start in UTC. A log without it, from an app from before, keeps the start's day in UTC, and so do
  the logs from before this decision.
- **The streak is worked out in Postgres** as ADR 0042 sets out: `streak_states()` gives how each
  day went, `streak()` the days in a row and a break to answer, and `answer_streak_break()` freezes
  the missed days or starts again. `streak_days` keeps final days and `user_streaks` each user's
  freezes and the last day whose break was answered; clients only read them.

## Alternatives considered

- **A band around the target:** it counts days eaten over the target, which works against a goal of
  losing fat, and would need a different band for each goal.
- **Only a lower bound, such as 90 % of the target:** it never misses a day eaten over the target.
- **Working the day out from the start's time and a stored time zone:** the app would have to keep
  the user's time zone up to date, and every other day in the app follows the device.

## Consequences

- Eating a little under the target counts, eating over it misses the day; a day over the target can
  only be saved by a freeze.
- The app sends `startedOn` with each finished workout.
- A few logs from before, started near midnight, may count for the day before or after.
