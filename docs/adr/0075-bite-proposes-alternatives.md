# 0075. Bite proposes alternatives for temporary changes, and edits several workouts at once

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

Bite changes the plan only through proposals the user applies (ADR 0058). Until now it could only
swap exercises in one workout, and the change was permanent. Asked for a workout that spares a
sore knee, it changed the workout itself, which the user then had to undo once the knee was better.
Bite did not know that workouts can have alternatives (ADR 0061), nor which one is in use, and it
saw only today's workouts (#397).

## Decision

- **Bite sees the whole plan:** the snapshot lists every active workout, its days and its
  alternatives, the one in use marked; `get_workouts` gives each alternative's id and, for those
  not in use, its exercises.
- **Three new kinds of proposal,** applied, kept and undone as the others are, only while what
  they replace, or what applying left, is still so (`BB035`):
  - **`workouts`:** a change to 1 to 3 workouts in one card, each with exercises swapped, removed
    and added (`propose_coach_workouts()`). This is the lasting change.
  - **`alternative`:** a new alternative of a workout, made from the one in use with such changes,
    and put in use when applied (`propose_coach_alternative()`). The one in use keeps its exercises
    and may be named, as "Gym" when the workout had no alternatives. A name the workout's
    alternatives have already is refused (`BB049`), so that Bite switches to that one instead.
    Undoing puts the one in use before back in use and removes the new one.
  - **`alternative_switch`:** puts another alternative in use, as when the user is better again
    (`propose_coach_alternative_switch()`); one in use already is refused (`BB050`). Undoing puts
    the one before back in use.
- **One edit for all of them:** `edited_workout_exercises()` swaps exercises in place, removes
  them, and adds new ones at the end with 90 s of rest. An exercise named that is not in the
  workout (`BB039`), or one changed twice or put in twice (`BB040`), is refused, so that the card
  shows exactly what applying does.
- **Bite decides which to propose:** an alternative for a temporary situation (an injury, travel,
  a closed gym), a change to the workout for a lasting one, and an alternative whenever the user
  asks for one. The tools and the rules for them come with the app's cards, as a tool is offered
  only for a card the app shows; until then Bite proposes as before.

## Alternatives considered

- **Changes for one day only:** every reader of a day's workout would need the day's version, as
  ADR 0061 found for alternatives per day; an alternative switched back covers the same need.
- **One card per workout:** a change to the whole plan would be three cards to apply one by one,
  and a half-applied plan.
- **Bite naming the whole list of exercises:** simpler for the database, but the card could not
  tell what changed from what stayed, and the model would have to repeat every exercise.

## Consequences

- A workout can have at most 5 alternatives (`BB041`); Bite then switches to one or says so.
- Alternatives' names stay within 12 characters, as the app shows them as chips.
