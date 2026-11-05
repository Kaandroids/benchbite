# 0085. A meal card goes to the meal the user chooses

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

Bite's meal card (ADR 0066) is added to the meal Bite gave it, and only its grams can change first.
Bite can guess the meal wrong, as when a late lunch is told in the evening, and the user then has
to add the card and move each entry by hand. The card is kept with its message, so a meal changed
on the row would not reach what the message holds.

## Decision

- **Edit also offers the four meals,** and the header follows the one chosen. So that the choice is
  always there, Edit opens the same view for a card of one food as for one of several; a food's
  grams are one tap further on a card of one.
- **`log_coach_meal_card()` takes the meal,** sent only when it differs from Bite's, like the grams.
- **`coach_meal_cards.meal` is where the card went.** The app reads it with the card's status, and
  the card says "Added to dinner" from there rather than from the message.

## Alternatives considered

- **Keep the meal in the app only and move the entries after adding:** two requests where one will
  do, and Undo would refuse the card, as its entries would no longer be as logged.
- **A second column for the chosen meal:** it would keep what Bite gave, which nothing reads.
- **A sheet opened from the card's header:** one more surface for a choice of four, and nothing
  would show that the header can be tapped.

## Consequences

- The row no longer says which meal Bite first gave; the stored message still does.
- A card of one food needs one more tap to change its grams.
