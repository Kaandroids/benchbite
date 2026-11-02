# 0076. Bite searches many exercises in one lookup, in up to five rounds

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

Since ADR 0075, Bite can change up to three workouts in one card. That needs several new
exercises. `search_exercises` took one query, and Bite searched for each exercise in a round of its
own. With four rounds of lookups (ADR 0052, 0070), a change to several workouts used them up before
Bite could propose it. Its answer then still said it had proposed a change or saved a note.

Each round sends the whole conversation to the model again, and the user waits for it. Raising the
limit makes every long answer slower and dearer, and it does not stop Bite from searching one
exercise at a time.

## Decision

- **One search for many exercises:** `search_exercises` takes up to five queries and gives each
  one's matches. Its description and the prompt tell Bite to search for everything it needs in one
  call.
- **Five rounds of lookups:** one more than before. That is enough for the plan, the exercises, a
  proposal, and a second try after the database refuses one, as when an alternative's name is
  taken.
- **No card claimed once lookups run out:** when the answer has made no card, proposal or note
  yet, the results before the last round say that none can be made now. One made in those rounds
  stays the answer's to speak of. An answer in the last round that still speaks of a card it did
  not make is told once to say, in a sentence, that it could not make one (`CARD_NOT_MADE`).

- **The target each exercise takes:** each match names it (reps, seconds, or meters or seconds),
  from `target_kind()`, which `target_suits()` now checks by, so that the rule is written once and
  Bite gives the right target the first time.

## Alternatives considered

- **Raising the limit only:** every long answer gets slower and dearer, and Bite still searches
  one exercise at a time.
- **Relying on parallel calls:** a round already allows five calls, but the model rarely makes
  several searches at once.

## Consequences

- An answer may take one round more than before, at most.
- A tool's result can hold up to five lists of matches, fifty exercises in all.
- The words that detect a card claim are the same as in ADR 0070, so a claim worded otherwise, as
  "I lined up an option", is not caught.
