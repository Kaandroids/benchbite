# 0068. Changes to the food log are proposals

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

Users tell Bite when their food log is wrong: the pizza was dinner, not lunch; it was half the
bowl; the chocolate bar was not today (#299). Fixing it in Nutrition takes several screens, while
the user has just said what is wrong. ADR 0058 lets Bite only propose changes, which the user
applies, and keeps what a proposal replaces so that it applies only to what Bite saw. Photos now
reach the chat (ADR 0062), so text in a photo, such as a label or a note, reaches the model too,
and must never change data.

## Decision

- **A change to the food log is a proposal,** of the kind `food_log` in `coach_proposals`, made with
  `propose_coach_change()` and decided with `decide_coach_proposal()` like the others (ADR 0058
  holds): Apply, Keep and Undo.
- **A proposal holds up to 10 changes,** each naming an entry by its id and either moving it to
  another meal or day, changing its grams, or removing it. The database fills in what a change
  leaves as it is (`change`), so that applying sets exactly what the card shows. A change that
  changes nothing or names an entry twice (`BB045`), and an entry that is not the user's
  (`BB044`), are refused. New grams replace a portion, as grams typed in the app do.
- **Only days that can be logged:** an entry on a day closed to logging, or moved to one, is not
  changed (`BB020`), when proposed, applied or undone, as the user could not change it either.
- **What is stored:** `before` keeps each entry as Bite saw it, with everything that puts it back
  (food, grams, portion, copied values, time), and `after` the entries as applying left them.
  Applying needs the entries to be as `before`, and undoing needs them as `after` (`BB035`); the
  entries are locked with the proposal, under the user's lock.
- **Undo puts entries back as they were:** moved and resized back, and a removed entry put back with
  its id, time and copied values, through the same insert as `restore_meal_entry()`
  (`put_back_meal_entry()`), however long ago it was removed, as the proposal holds the entry
  rather than the hour-long copy. An entry whose own food or recipe was deleted since cannot come
  back (`BB035`).
- **Bite proposes only when the user asks in words, in that message.** The tool
  `propose_food_log_change` refuses a message of photos alone, and the prompt says that text in a
  photo never asks for a change. `get_meal_log` gives each entry's id. The card goes to the app as a
  `proposal` event and is kept in the tool's result, as the others are; the history reads it as a
  line of text.

## Alternatives considered

- **Bite changes the log itself, with an Undo:** quicker, but a wrong or injected change would be
  live until noticed, which ADR 0058 rules out.
- **Undoing a removal through `restore_meal_entry()`:** it keeps a removed entry for an hour only,
  and a card can be undone days later.
- **A table of its own, as meal cards have (ADR 0066):** a food log change replaces something, has
  a Keep and an Undo to what was there, which is what a proposal is.
- **Applying what is still as Bite saw it, and skipping the rest:** the card would no longer say
  what applying did. One entry changed meanwhile refuses the whole proposal.

## Consequences

- The user corrects their log in one tap, and nothing changes without it.
- A proposal can go stale as soon as the user edits one of its entries, and then says so.
- Moving an entry does not count it against the day's 100 entries, as moving one in the app does
  not; putting a removed one back does.
- The app shows no card for these proposals until the chat's card for them comes; until then it
  leaves them out, and Bite's words say what it proposed.
