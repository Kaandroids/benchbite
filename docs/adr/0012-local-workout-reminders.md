# 0012. Remind people to train with local notifications

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Reminders on training days help people keep going, and the onboarding offers them (#20). A
reminder has to arrive at a fixed time on fixed weekdays, also without a connection. The
permission to show notifications is granted per device, and people decline it more often when it
is asked for without a reason.

## Decision

Workout reminders are local notifications scheduled on the device with `expo-notifications`: one
per training day, repeating every week at the chosen time. Their text is written when they are
scheduled, from the plan and in the app language. The system prompt is shown only after the user
chose to turn reminders on.

The scheduled notifications are the only record of the reminders. Nothing is stored in Supabase,
and the app asks the system which reminders are scheduled instead of keeping a copy.

Remote notifications are turned off in the config plugin, and delivery on Android is not exact,
so the app needs neither the push entitlement nor the exact alarm permission.

## Alternatives considered

- **Push notifications sent from Supabase,** for example by a `pg_cron` job. They could follow
  changes made on another device, but need push tokens, a sender and a connection at the right
  time, all for a message that only depends on the plan and a time of day.
- **Storing the reminder time in the profile.** It would survive a reinstall and could be shown on
  other devices, but the notifications and their permission belong to one device anyway. The time
  can move to the profile when settings need it.
- **Asking for the permission on first launch.** Leads to more declines, because there is no
  context yet.

## Consequences

- Reminders work offline and need no server code.
- After a reinstall or on a new device, reminders have to be turned on again.
- When the plan changes, the reminders have to be scheduled again, because their text and days
  come from the plan.
- The text stays in the language that was used when the reminders were scheduled.
