# 0058. Bite proposes, the user applies

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

Bite should be able to change the plan and the targets when the user asks, as when a knee hurts
or the weight stops moving (#297). An AI that writes the user's data itself can be wrong, or be
talked into a change, with nothing between it and the data. The design shows each change as a
card in the chat that the user applies or keeps as it is, with Undo (boards 4, 5 and 11).

## Decision

- **Bite only proposes.** Its tools call `propose_coach_change(thread_id, kind, change, today)` as the
  user, which writes a row to `coach_proposals`: a workout as `save_workout()` takes it, or the
  user's own targets. Users read their proposals but write them only through the functions.
- **Bite's tools:** `get_workouts` reads the plan with the exercises' ids; `propose_workout_change`
  names the exercises and calls `propose_coach_swaps(thread_id, workout_id, swaps, today)`, which
  builds the whole workout from `saved_workout()` in the database and refuses an exercise not in
  it (`BB039`), or one swapped twice, into another swap or in the workout twice (`BB040`), as the
  card could not show what applying does; `propose_targets_change` proposes new targets. Each returns the card the chat shows (`proposal` event), which the message keeps in the
  tool's result, so that a chat read back shows it too. A proposal is an answer even when the model
  adds no words.
- **A proposal keeps what it replaces** (`before`), read by `coach_proposal_state()`: the workout
  as `saved_workout()` gives it, or the own targets. `decide_coach_proposal(id, decision, today)`
  applies it only while that is still so, keeps it, or undoes it only while what applying left
  (`after`) is still so. A change the user made meanwhile is never overwritten (`BB035`).
- **Changes go through the app's own functions:** `save_workout()` for the plan, and
  `save_own_nutrition_targets()` for the targets, which this decision adds and the app now uses
  too: it saves them and keeps today's targets (ADR 0040) in one call. Their checks, and the days
  kept before today (ADR 0041), hold the same for Bite.
- **Every path that changes the targets keeps today's in the same call:** saving one's own
  targets, going back to the calculated ones (`use_calculated_nutrition_targets()`), a new goal
  (`recalculate_nutrition_targets(..., today)`) and a logged weight (`log_weight()`), where the app
  did it in a second call that could fail alone.
- **A proposal must apply when it is made:** it is tried through those functions and rolled
  back, so that one that never could is refused at once with their own errors, and Bite can
  correct it.
- **A user has at most 20 proposals pending and makes at most 100 a day** (`BB038`), as the
  function is open to every signed-in user, not only through Bite.
- **Targets never go below the calorie floor** (ADR 0053), checked when proposed and again when
  applied, as the floor can rise meanwhile (`BB037`).
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
- Undo puts the workout back as it was, but not the moves a change of its weekdays ended: a
  session moved from a day the change took off the plan stays where the plan now puts it. The
  card says so when a change moves the days, and the user moves the session again if they want.
- The cards say "From today" rather than the design's "From tomorrow" and "Today only", until
  scheduled changes and alternative workouts come.
