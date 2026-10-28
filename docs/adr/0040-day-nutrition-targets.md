# 0040. Keep each day's targets with the day

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The targets are worked out when they are read (ADR 0009), and since #234 people can set their
own (ADR 0039). A past day was measured against the targets in use now, so a new goal or a new
weight changed how past days looked: a day 200 kcal over a goal of 2,800 showed 100 kcal left
once the goal became 3,100 (#239). The entries themselves keep their values (ADR 0034).

## Decision

- **A day keeps its targets:** `day_nutrition_targets` holds a user's calories and macros for a
  day. A trigger on `meal_entries` writes the targets in use when a day gets its first entry, or
  an entry moves to a day without targets, and never changes them afterwards.
- **Only the trigger writes them:** clients may read their own rows; the trigger runs with its
  owner's rights and writes for the entry's owner only, from `my_nutrition_targets()`.
- **Which targets a day is measured against:** today, always the ones in use, so a change shows at
  once. A past day, the ones it kept; a past day without any, as nothing was logged on it, the
  ones in use. The app decides which day is today, as days follow the device (ADR 0034).
- **Days logged before:** the migration gives them the targets in use when it runs, the closest
  there is to the ones they had.

## Alternatives considered

- **A history of target changes with the dates they started:** the calculated targets change with
  every weight, so each weight would need a row, and reading a day would replay them.
- **Keeping the targets for every day, logged or not:** most days are logged; a day without
  entries has nothing to measure.
- **Measuring past days against the targets in use:** what it did before; it rewrites how past
  days went, and a streak would follow.

## Consequences

- Changing the goal, one's own targets or the weight changes today and the days after it.
- A past day logged for the first time later keeps the targets in use then, not the ones it would
  have had.
- Weeks of workouts need the same treatment for their plans (#241).
