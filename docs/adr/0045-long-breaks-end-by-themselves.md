# 0045. A break reaching back more than a week ends by itself

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

ADR 0042 keeps a break of the streak until the user answers it, freezing the missed days or
starting again, and shows it in a popup until then. After a long time away, the popup would greet
the user with every day they were gone: days that can no longer be logged (ADR 0034), whose
workouts can no longer be postponed (ADR 0028), and usually more of them than any freezes cover.
The popup now also says why each day missed and what mends it (#278), which only helps for days of
the last week.

## Decision

- **A break that reaches back more than a week ends by itself, as starting again.** When a missed
  day not answered yet lies more than a week before the device's today, `streak()` answers its
  whole run of missed days without spending freezes, and keeps those days.
- **Only later missed days ask to be answered.** A missed day after a day that counted is a break
  of its own, and the popup shows it as before.
- **The reasons cover the last week.** `streak_break_days()` leaves out days more than a week
  before today and days from today on, so a break never holds more than a week of days.

## Alternatives considered

- **Showing every missed day, as before:** after a long absence the first thing the user sees is a
  break they cannot mend, which works against coming back.
- **Freezing what the freezes cover and dropping the rest:** freezes are spent only by choice
  (ADR 0042), and spending some of them cannot keep a streak that broke anyway.
- **Ending breaks older than a week only after the popup was seen:** the popup would still show
  them once, the moment the user returns.

## Consequences

- A user back after more than a week starts a new streak without a popup; their freezes stay.
- Repairing such a break later with freezes earned since (#274) stays possible, as the days are
  kept as missed.
- `streak()` writes on a read, as it already keeps final days.
