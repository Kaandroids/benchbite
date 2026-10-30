# 0058. Bite proposes, the user applies

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite should be able to change the plan and the targets when the user asks, as when a knee hurts
or the weight stops moving (#297). An AI that writes the user's data itself can be wrong, or be
talked into a change, with nothing between it and the data. The design shows each change as a
card in the chat that the user applies or keeps as it is, with Undo (boards 4, 5 and 11).

## Decision

- **Bite only proposes.** Its tools call `propose_coach_change(thread_id, kind, change)` as the
  user, which writes a row to `coach_proposals`: a workout as `save_workout()` takes it, or the
  user's own targets. Users read their proposals but write them only through the functions.
- **A proposal keeps what it replaces** (`before`), read by `coach_proposal_state()`: the workout
  as `saved_workout()` gives it, or the own targets. `decide_coach_proposal(id, decision, today)`
  applies it only while that is still so, keeps it, or undoes it only while what applying left
  (`after`) is still so. A change the user made meanwhile is never overwritten (`BB035`).
- **Changes go through the app's own paths:** `save_workout()` for the plan, the own targets for
  the targets, so their checks and the days kept before today (ADR 0041) hold.
- **Targets never go below the calorie floor** (ADR 0053): such a proposal is refused (`BB037`).
- **A proposal expires after a week,** as what it was made for has passed.
- **Changes are permanent and apply at once.** A workout change edits the workout itself, and new
  targets count from today, as the day's targets follow the targets in use until it ends.

## Alternatives considered

- **Bite writes the change and the user undoes it.** Fewer taps, but a wrong change is live until
  noticed, and the model would hold write rights to the user's data.
- **A change for today only** (board 4's "Today only"): needs a workout of the day apart from the
  plan. Alternative versions of a workout (#346) bring that; until then Bite's change is permanent.
- **Changes from tomorrow:** the targets of today would stay, but a scheduled change needs a place
  that lists what changes when, which #351 adds.

## Consequences

- The model never holds a right the user does not have, and every change is one tap to undo.
- A proposal can go stale, and then says so rather than applying.
- The cards say "From today" rather than the design's "From tomorrow" and "Today only", until
  scheduled changes and alternative workouts come.
