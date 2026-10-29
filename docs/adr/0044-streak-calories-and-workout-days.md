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
  start in UTC, and checks the move that comes with the log against it. A log without it, from an
  app from before, keeps the start's day in UTC, and so do the logs from before this decision.
- **A finished workout keeps the workout it was started from** (`source_workout_id`) after that
  workout is deleted, as the days it was planned on keep it (ADR 0041), so that a deleted workout
  still counts on the days it was done.
- **Only the user's skips miss a day:** a skipped workout misses its day even when it was done
  anyway. A move that the database turned into a skip, as the workout was archived, deleted or
  left the day it moved to (ADR 0041), is marked `settled` and leaves its day to the calories, as
  the move did.
- **A streak starts on the user's first read of it:** the days before it could not be seen to
  count, so their breaks are answered through the day before, for users from before the streak
  and for a new user, whose first read is the day the plan starts.
- **A day is `done`, `frozen` or `missed`, and today `open` until it is done,** the names the app
  uses for a day's mark.
- **The streak is worked out in Postgres** as ADR 0042 sets out: `day_workouts()` gives each day's
  workouts after moves and whether they were done or skipped, `streak_states()` how each day
  went, `streak()` the days in a row and a break to answer, and `answer_streak_break()` freezes
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
- The week card still works out a day's workouts in the app (`weekSchedule()`) and differs in two
  places: it shows a workout skipped but done as done, and reads a settled move as a skip. Reading
  `day_workouts()` instead would give both one rule (#268).
- Days become final once they can no longer be logged, which `last_day_closed_to_logging()` names
  for the meal and water checks and the streak alike.
- A log without `startedOn` but with a move takes the move's day, which is the device's. A few
  logs from before, started near midnight, may count for the day before or after.
