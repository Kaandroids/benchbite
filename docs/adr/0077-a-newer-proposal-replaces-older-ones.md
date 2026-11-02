# 0077. A newer proposal for a workout replaces the older ones pending for it

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

Bite sometimes proposes a change and, in the same answer, proposes it again with what it left out,
as an exercise to add. Both cards wait for the user. Applying one makes the other refuse
(`BB035`), and two cards for one change confuse the user. A proposal from an earlier answer for the
same workout is just as stale once Bite proposes anew.

## Decision

- **A new status, `replaced`:** a proposal a newer one replaced before it was decided. It is decided
  like `kept`, so it cannot be applied (`BB036`), and it no longer counts as pending.
- **A trigger replaces them:** after a proposal is inserted, the ones still pending in the same
  thread whose workouts it all changes too are marked `replaced`. The workouts are matched as
  `decide_coach_proposal()` locks them, with `coach_proposal_workout_ids()`. One that also changes
  other workouts stays, so that no change is lost; applying either then refuses the other
  (`BB035`). Targets and the food log are left as they are.
- **Bite carries the changes over:** the prompt tells it that a new proposal for a workout replaces
  the one waiting for it, and to include the changes of that one the user still wants.
- **The card says so:** it folds into a line, "Replaced by the newer proposal below", with nothing
  to decide.

## Alternatives considered

- **Refusing a second proposal for a workout in one answer:** Bite could no longer correct what it
  left out, and the incomplete card would stay to be applied.
- **Marking them `kept`:** the card would say the user kept things as they are, which they did not
  choose.

## Consequences

- Only the newest card for a workout in a thread can be applied.
- A newer proposal also replaces an older one from an earlier answer of the same thread, not ones
  in other threads.
