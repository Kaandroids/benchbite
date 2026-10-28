# 0038. Sum recipes from their ingredients and log them by the serving

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Home cooking is made of several foods, and logging each one every time is tedious (#204). A dish
is usually cooked for several people or days, so one serving is what gets eaten and logged.

## Decision

- **Two tables of the owner's:** `recipes` holds a name, how many servings it makes and their
  unit, such as 4 bowls. `recipe_ingredients` holds library foods or foods of one's own, each with
  grams and the portion that was picked, in the order shown. Row level security limits both to the
  owner, and an ingredient can be only a library food or one of the owner's foods.
- **Values are summed, not stored:** the view `recipe_values` sums the ingredients with their
  foods' current values into the recipe's weight and its values per 100 g. A serving is the whole
  weight shared out by the servings. Nothing needs updating when a food or the recipe changes.
- **Logged like a food:** an entry names a library food, a food of one's own or a recipe, exactly
  one, and copies its values per 100 g (ADR 0034). The recipe's portion is one serving, so the
  amount screen and the lists work as for foods. Changing a recipe later leaves past entries as
  they were.
- **Saved in one step:** `save_recipe()` adds a recipe or changes one, with all its ingredients,
  in one statement that runs as the caller, so the policies apply.
- **Deleting archives,** as for foods of one's own (ADR 0036): past entries keep the recipe, and
  search, the lists and logging no longer offer it. A deleted recipe cannot be changed (`BB030`).
- **Everywhere a food is:** `loggable_foods()`, search, favourites, frequent foods and copying a
  past meal include recipes (ADR 0037).
- **Limits:** up to 100 recipes per user (`BB028`), 500 counting deleted ones (`BB029`), and 50
  ingredients per recipe. A serving weighs at most 5,000 g, as an entry does. Names are unique per user, compared as search compares them.
- **Cooked weight is not asked for:** water lost or taken up in cooking would change the values
  per 100 g but not per serving, and servings are how a dish is logged. Water can be added as an
  ingredient where it matters for grams.

## Alternatives considered

- **Storing a recipe's totals:** they would go stale when a food of one's own in it changes.
- **Logging a recipe as its ingredients, one entry each:** the day would fill with rows, and a
  serving of a dish cooked for four could not be logged as one.
- **A recipe as a food of one's own with summed values:** it would lose its ingredients, and so
  could not be changed later.
- **Asking for the cooked weight:** a step most people skip or guess, for a difference that
  servings already cover.

## Consequences

- Every place that names a food handles a third kind, through `FoodRef` in the app.
- In the database a food is named by one column per kind (`food_id`, `custom_food_id`,
  `recipe_id`), exactly one set. Another kind would mean a column on entries, removed entries and
  favourites, a branch in `copy_food_values()` and `can_be_logged()`, and a part in
  `loggable_foods()` and `search_foods()`, whose result types change with it.
- A recipe's values follow its ingredients, so a food of one's own changed later changes the
  recipe for the next entry, but not for past ones.
