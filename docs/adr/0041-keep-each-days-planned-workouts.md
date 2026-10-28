# 0041. Keep each day's planned workouts with the day

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A week's planned workouts were worked out from the workouts as they are now: their weekdays and
whether they are active (`weekSchedule()`, ADR 0028). Only the moves and skips of a week were
stored, and done, missed and skipped follow from the plan, the moves and the logs. So changing the
plan changed the past: with Mon, Wed and Fri changed to Tue, Thu and Sat, last Monday's workout
became an extra and Tuesday a missed one. Archiving, adding or deleting a workout did the same.
Even within the current week, the days already past changed. Swiping to earlier weeks (#71) and
streaks (#70) will read past weeks, and a streak would break or mend after the fact (#241).

Days already keep their nutrition targets in the same way (ADR 0040).

## Decision

- **A past day keeps its plan:** `planned_days` holds, for each kept day, the workouts planned on
  it: the active workouts on its weekday, with their id, name and type, which stay if the workout
  is later deleted, as its moves keep its id. `planned_days_kept` holds the last kept day per user. Up to it, a day is planned
  as its rows say, no rows meaning a day without workouts; after it, by the plan as it is.
- **A change counts from today:** before the plan changes, the days since the last kept one up to
  yesterday are kept with the plan they had. Today and later days follow the changed plan, so
  a workout done today and then taken off today's plan counts as an extra.
- **The device says which day is today:** the functions that change the plan take the device's
  today and keep the days before it in the same transaction as the change: `save_workout`,
  `set_workout_active` and `delete_workout`, as days follow the device (ADR 0034). It refuses a day more than one from the server's.
  A trigger on `workouts` (insert, delete, a change of weekdays or active) keeps the days through
  the last day past on every device, the day before the server's yesterday, in any case, so no
  change can reach a past day whatever path it takes, while a device a day behind the server
  still changes its today. A user being deleted keeps nothing. Every function that takes the
  device's today checks it the same way (`assert_device_today()`), the day targets too.
- **Kept days are never written again,** and only the database writes them: clients read their
  own rows, and the functions run with their owner's rights for the caller only. Calls for one
  user wait for each other, and the last kept day only moves forward.
- **One function reads a day's plan:** `planned_workouts(from_day, to_day, today)`, the only way
  clients read it, returns each
  day's workouts for up to a year: kept days as kept, and the device's today and later days by
  the plan. Days before the plan started have none. The week, earlier weeks (#71) and streaks
  (#70) all read it, as `targets_of_day()` decides a day's targets (ADR 0040). Keeping and reading
  both take the plan from `plan_by_weekdays()`, so a day reads the same before and after it is
  kept.
- **The plan starts on the device's day:** the app sends its today with the onboarding's answers,
  and `complete_onboarding()` records it as the day the plan started, so that neither the days
  before it nor today are lost to the server's date. A device clock more than a day off starts it
  on the server's day instead, so that the onboarding can always be finished.
- **Moves stay with the days that keep them:** the same trigger settles a workout's moves when its
  weekdays change or it is archived or deleted. A move into a kept day stays, with the plan it was
  made for. Of the moves into later days, those that no longer fit go, as before, unless they come
  from a kept day: that one becomes a skip of it, which frees the target and leaves the kept day as
  it went. A deleted workout's moves on kept days stay without a workout, as its kept days do.
- **Days before:** the migration keeps the days from the end of each user's onboarding, or a guest's
  first workout, through the last day past on every device with the plan as it is when it runs,
  the closest there is to the one they had.

## Alternatives considered

- **A history of plan changes with the dates they took effect:** every change to a workout's days,
  activation or deletion would need a dated row, and reading a day would replay them. Keeping
  the days is simpler to read and works like ADR 0040.
- **Counting a change from the next day:** today would keep the old plan, so a change made for
  today, such as moving today's workout to another weekday, would show only tomorrow.
- **Keeping days with a scheduled job each night:** it needs `pg_cron` and the user's time zone,
  and keeps days that nothing reads. Keeping them when the plan changes is enough, as only a
  change can make them differ from the plan as it is.
- **Leaving past days planned from the current workouts:** what it did before; it rewrites how past
  weeks went, and the streak with them.

## Consequences

- Every place in the app that changes the plan (saving, archiving or deleting a workout) calls
  the function for it with the device's today. Without it, the trigger still keeps the days the
  server knows to be past.
- The week schedule takes each day's planned workouts from `planned_workouts()` instead of the
  weekdays.
- A past day of a deleted workout shows its name but can no longer be moved or started; its moves
  and skips keep its id, as the day does.
- The app sends `today` with the onboarding's answers.
