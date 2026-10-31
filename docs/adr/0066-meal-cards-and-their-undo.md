# 0066. Meal cards in their own table, and an Undo that leaves foods in use

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

ADR 0062 logs a meal from Bite's chat through a card: the user adds it, may change its grams, and
undoes it with `undo_meal_estimate()` (ADR 0060). Building it raised three questions that ADR 0062
does not answer. Bite's other changes are kept as proposals (ADR 0058), and a card could be one
too. A card stays in the chat, so its Undo can be tapped days after it was logged, when the own
foods it saved may be in use: logged again, put in a recipe or starred. And an item matched to an
own food of exactly its search name was logged by that food's id, so a card or an estimate failed
once that food was gone, as when the user undid the meal that made it.

## Decision

- **Meal cards are kept in their own table, `coach_meal_cards`,** not in `coach_proposals`. A card
  replaces nothing, so there is no state from before to compare with and no "keep"; it is logged
  with grams the user may change; and its Undo removes what it made rather than putting something
  back. The table keeps the items, the status (pending, logged or undone), the entries and the own
  foods that logging made, and those as they were then. Users only read it; `add_coach_meal_card()`,
  `log_coach_meal_card()` and `undo_coach_meal_card()` write it. A card is tried when Bite makes it,
  so that it is refused then rather than when the user taps Add.
- **A card's Undo removes the own foods it saved only while they are unused.** It removes the card's
  entries only while they are as logged (moved, resized or removed, they are the user's now). Of
  its foods, it removes one only while it is unchanged since logging, no pending card holds it and
  nothing else names it: no other entry, no removed entry that can still be restored, no recipe
  ingredient and no star. The first two are checked by hand; the rest is left to the foods' foreign
  keys, so that a delete they refuse leaves the food, and a new reference counts without a change
  here. Any other food stays as it is, neither deleted nor archived. Nutrition's photo keeps ADR 0060's rule, as its Undo is a toast shown right after
  logging: the foods it made are deleted, or archived when something names them.
- **An own food matched by its exact search name is logged by its name and values,** not by its id,
  with `logItemOf()` in `_shared/meal/log.ts`, which both the chat's card and Nutrition's photo use.
  `log_meal_estimate()` then finds that food by name, or makes it again when it was removed. An own
  food matched by another name is still logged by its id.

This amends ADR 0062, whose card's Undo removed the foods with `undo_meal_estimate()`'s rule.

## Alternatives considered

- **Cards as a kind of proposal in `coach_proposals`:** one table for Bite's suggestions, but most
  of its columns and rules (the state to compare, keep or apply) would not fit a card, and a card's
  own columns would be empty for every other proposal.
- **ADR 0060's rule for a card's Undo:** simpler, but a card undone days later would delete or
  archive a food the user had come to use since.
- **Refusing a card's Undo while one of its foods is in use:** the meal would stay logged although
  the user wants it gone; leaving the food removes the meal and keeps what the user still uses.
- **Logging an own food of the search name by its id, and refusing when it is gone:** the card
  would fail for a reason the user cannot see, and Bite would have to make a new one.

## Consequences

- A card can be undone whenever the chat shows it, without taking a food the user uses elsewhere.
- An own food a card saved can stay after its Undo, and counts towards the user's 1,000 foods
  until they delete it.
- Undo differs between the chat and Nutrition's photo, by when it can be tapped.
- An item of a removed own food logs again in both places, with the values the estimate gave.
