# 0029. Schedule workout reminders from the week as it is

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

[ADR 0012](0012-local-workout-reminders.md) scheduled one local notification per training day,
repeating every week, once in the onboarding. The week has changed since then:

- A workout can move to another day, or be skipped, for one week only ([ADR 0028](0028-move-workouts-within-their-week.md)).
  A repeating notification cannot skip one week, so a moved workout was still reminded on its own
  day and not on the day it moved to.
- A day can have several workouts, and the reminders were keyed by weekday, so only one of them was
  reminded.
- Workouts can be edited, archived and added after the onboarding, and the reminders did not follow.

## Decision

Workout reminders are one-off local notifications for the coming 28 days, one for each day that has
workouts still to do. A day's reminder names all of its workouts. The days come from the same
`weekSchedule()` the Today tab uses, so this week follows its moves and skips, and leaves out
workouts already done. The weeks after it follow the plan's weekdays.

The app schedules them again whenever what they would say changes: when the workouts, this week's
moves or the finished workouts change, when the language changes, and when the app comes back on a
new day. It replaces all of them each time, so nothing can drift.

The reminder time is kept on the device in the key-value store, because the notifications run out
and are no longer a record of it. It is set in the onboarding after the permission prompt, as
before, and removed when reminders are turned off.

## Alternatives considered

- **Keeping the repeating weekly notifications:** they keep working when the app is not opened, but
  cannot leave out one week, so moves and skips cannot be shown.
- **Repeating notifications with one-off ones for this week:** a repeating notification would still
  fire on a moved workout's own day.
- **A shorter horizon, such as 14 days:** fewer notifications, but reminders stop sooner when the app
  is not opened. 28 days with at most one notification a day stays well under the 64 that iOS keeps
  scheduled for an app.
- **Push notifications from Supabase:** the reasons in ADR 0012 still hold.

## Consequences

- Moves, skips, several workouts a day and changes to the workouts all show in the reminders.
- After 28 days without opening the app, the reminders stop until it is opened again.
- The reminder time lives on the device. After a reinstall, reminders have to be turned on again, as
  before.
- Devices that turned reminders on with ADR 0012 keep their weekly notifications until reminders are
  turned on again, because their time was never stored. The app has not been released, so no
  migration is written.
