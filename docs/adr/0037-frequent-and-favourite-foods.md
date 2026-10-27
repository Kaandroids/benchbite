# 0037. Count frequent foods from the entries, and keep favourites in a table

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Most people eat the same foods again and again, and searching for them every time is slow (#205).
The add screen should offer the foods logged most at a meal, the foods a user starred, and a past
meal to add again in one tap.

## Decision

- **Frequent foods are counted, not stored:** `frequent_foods(meal, language)` counts the user's
  entries of that meal over the last 90 days and returns the 10 logged most, with the amount they
  were logged with last. + adds that amount again, as people tend to eat the same amount.
- **Favourites are a table, `favourite_foods`:** the owner and a library food or one of their
  own, exactly one, once each. Users read, star and unstar only their own, and can star only their
  own foods. Up to 500 per user (`BB027`). `list_favourite_foods(language)` returns them newest
  first, shaped like search results.
- **A past meal is repeated in one step:** `repeat_meal(from_day, to_day, meal)` copies the entries
  with their amounts in one statement, so a failure adds none. The foods' current values are
  copied (ADR 0034), and foods that can no longer be logged are left out.
- **Only foods that can still be logged are offered:** archived library foods and deleted foods of
  one's own drop out of all three.
- **Search stays as it is:** typing searches every food. The tabs Frequent, Favourites and Mine show
  only while the search is empty.

## Alternatives considered

- **Storing counts per food:** they can be derived from the entries, so they would only drift.
- **Counting over all time:** what someone ate months ago would crowd out what they eat now.
- **A favourite flag on the entries or the foods:** library foods are shared by everyone, and
  entries are many per food.
- **Repeating a meal entry by entry from the app:** a failure halfway would leave half a meal.

## Consequences

- Frequent foods need no upkeep and follow removals and changes to entries at once.
- Recipes (#204) add a third reference column to `favourite_foods`, as to the entries.
