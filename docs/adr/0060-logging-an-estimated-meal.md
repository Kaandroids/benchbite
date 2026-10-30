# 0060. Logging a meal estimated from photos

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

An estimate of a meal from photos (ADR 0059) gives foods the library or the user's own foods
matched, and foods it matched none for, with only the model's values per 100 g. A meal entry
names a food (`food_id`, `custom_food_id` or `recipe_id`, ADR 0038) and copies its values
(ADR 0034), so an item with only values cannot be logged as it is (#357). Adding the meal should
add all of its foods or none, and Undo should take back what it added.

## Decision

- **An item the library did not have is saved as a food of the user's own,** named by the
  estimate's `searchName`, which is in the library's form ("Mango chutney"), with the model's
  values per 100 g, and logged from it. When the user already has a food of that name, compared as
  search compares names, it is logged instead and keeps its values, so that the same item is not
  saved twice and the next estimate matches it (ADR 0059 prefers the user's own food).
- **One Postgres function, `log_meal_estimate(day, meal, items)`,** logs the meal in a
  transaction: found foods by their id at their grams, and each other item as above. It runs with
  the caller's rights, so that row level security, the grants and the limits on own foods and
  entries apply as when the app adds them one by one. The model's values are first made to pass a
  food's checks by `fitted_food_values()`, which mirrors them: protein, carbs and fat are shared
  down to 100 g together, and calories below what they make, beyond the allowance for rounding,
  are raised to it. It returns each entry with the calories it was logged with, the own food it
  named and whether it made that food, and the app tells what was added from these, not from the
  estimate.
- **An own food of exactly the search name is the item,** in `estimate-meal` as in the function:
  the estimate takes it whatever its calories (ADR 0059), as logging would, so that the card shows
  what is logged. The unique name of own foods decides between two estimates logged at once.
- **Undo is one function too, `undo_meal_estimate(entry_ids, food_ids)`:** it removes the entries
  for good, as they were never eaten, and deletes the own foods the meal made when nothing else
  names them, so that logging and undoing does not use up the 1,000 foods a user may add; one that
  something names is archived, as deleting it in the app does. It runs with its owner's rights to
  do so, on the caller's own rows only.
- **The add screen and the photo screen hand each other the photos and the result in the app's
  memory,** as the meal screen gets a removed entry back from the entry screen: the add screen
  keeps the photos under a new key and opens the photo screen with only that key, and the photo
  screen hands what it logged back, which the add screen shows as added with a toast and Undo.
  Neither goes in the route, as a link could otherwise start an estimate of any address at the
  user's cost, or show a meal as logged. The scaled copies of the photos are
  deleted once read, and the photos, which the camera and the picker leave in the app's cache
  folder, once others replace them or the screen closes.

## Alternatives considered

- **Adding the items one by one from the app** with the existing paths (`custom_foods` and
  `meal_entries` inserts): no new function, but a failure halfway would log part of a meal, and
  a dozen requests where one does.
- **The photos as a route parameter:** simpler, and how screens pass most things, but a link
  would choose what is estimated; accepting only files of the cache folder would close that too,
  with a check that has to stay right.
- **A meal entry with its own values and no food:** simpler to log, but every entry names a food
  today, which the day's sums, the frequent foods and copying a meal rely on.
- **Asking the user to name each new food before it is saved:** more control, but the estimate
  should take a tap to log; the food can be renamed or deleted in the user's foods afterwards.

## Consequences

- An estimated item becomes a food in the user's list of their own foods, and counts against
  their limit of 200 (ADR 0036). A model that names the same food a little differently another
  time makes a second one; their values barely differ.
- The next estimate of the same meal matches the saved food, so it is logged at the same values.
- Undo deletes the foods the meal made; one the user logged by hand in between, or put in a
  recipe, stays archived for that entry or recipe.
- A meal logged and then undone cannot be restored from the meal screen, unlike a removed entry.
- The photo screen opened from anywhere but the add screen, as by a link, finds no photos and
  goes to the day.
