# 0036. Let people add foods of their own, private and archived on delete

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The library holds about 350 everyday foods from the BLS (ADR 0033). It lacks packaged products,
brands and home dishes. People need to log those from the values printed on their label (#203).

## Decision

- **A table of its own, `custom_foods`:** the owner, a name, kcal and macros per 100 g, and one
  optional portion such as 1 can = 330 g. Row level security limits every row to its owner.
- **Entered per 100 g, as labels print them:** the form takes the values per 100 g, and a portion
  as a unit and the grams it weighs. Macros left empty count as 0. The macros must add up to the
  calories within 15 % or 10 kcal, as labels round; otherwise the values were typed wrong, and
  the form says so, naming both numbers, and does not save.
- **Entries name either kind of food:** `meal_entries` has `food_id` or `custom_food_id`, exactly
  one of them. The same trigger copies the values (ADR 0034). A food of another user counts as
  unknown, so its id reveals nothing.
- **Search finds both:** `search_foods` returns a library food's `food_id` or one's own
  `custom_food_id`. Both kinds are ranked alike (ADR 0035), and on a tie one's own food comes first.
- **Deleting archives:** clients may not delete a row. Setting `archived_at` takes the food out of
  search and logging, while past entries keep it and its name. It is for good: a trigger refuses
  to change or bring back a deleted food, and sets the server's time.
- **Limits:** up to 200 foods per user, and up to 1,000 counting deleted ones, so that deleting and
  adding again cannot grow the table without end. Both are counted under the user's limit lock.
  Names are unique per user, compared as search compares them.
- **In the app:** a food is named by a `FoodRef`, `{ kind: 'library', id }` or
  `{ kind: 'custom', id }`. In routes it is written as the BLS code or as `custom-<id>`.

## Alternatives considered

- **Entering values per portion too, scaled to 100 g:** some labels print both, but a switch
  between the two was hard to follow in the form, and labels in the EU always give the values
  per 100 g.
- **Sharing foods between users, as some apps do:** search would fill with duplicates and wrong
  values that need moderation.
- **Adding them to `foods` with an owner column:** the library's rows are imported from the BLS
  and read by everyone. Mixing in private rows would complicate its policies, its import and its
  names table.
- **Deleting rows:** entries reference the food, and their names come from it.

- **Only warning when the macros do not add up:** it would let wrong values into every day the
  food is logged on.

## Consequences

- Every place that reads entries or foods handles both kinds, through `FoodRef` in the app.
- A food changed after logging leaves past entries as they were, as for the library.
- Foods whose energy comes from more than protein, carbs and fat, such as alcohol or sugar
  alcohols, may not pass the check; they need their macros as the label counts them.
- Recipes (#204) can follow the same pattern: a table of their own, and a third reference column
  on entries.
