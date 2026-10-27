# 0034. Log meals as entries with copied values, per local day and fixed meal

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The Nutrition tab shows what someone ate on a day against their targets (#200), meal by meal.
Entries name foods of the library (ADR 0033), which can change: a new BLS release corrects a value,
or a food is taken out of the list and archived. A past day should still show what was counted
then. Later, entries will also name custom foods (#203) and recipes (#204).

People log late at night and travel, so "today" is the day on their phone, not the server's.

## Decision

- **One table, `meal_entries`:** the user, the local day as a `date`, the meal, the food, the
  amount in grams and the portion that was picked, if any (such as 2 slices).
- **Copied values:** when an entry is added, a trigger copies the food's kcal, protein, carbs and
  fat per 100 g into it. Generated columns hold what the entry adds to its day. Changing the
  amount recalculates them; the copied values never change. The food's name is not copied: library
  foods are archived, not deleted, so the name is always there, in every language.
- **Plain table access:** the app adds, changes and deletes its own entries directly, under row
  level security. Column privileges let it send only the day, meal, food and amount, so the copied
  values cannot be faked, and an entry cannot switch to another food.
- **Fixed meals:** breakfast, lunch, dinner and snack, as an enum.
- **The local day:** the app sends the day it shows. Meals are logged for today and the week
  before it, so a forgotten meal can be added but a day cannot be filled in long after. The app
  goes back 7 days; the database allows one more day on each side of its own date, as the user's
  day may differ from the server's by one either way. Entries older than the week can still be
  corrected and deleted.
- **Limits:** up to 100 entries per day, counted under the user's limit lock. With the week
  window, a user can add about a thousand entries at once and then 100 a day, so a broken client
  or a cheap anonymous session cannot fill the table.

- **Undo:** a removed entry is kept for an hour in `removed_meal_entries`, which the app cannot
  read, and `restore_meal_entry()` puts it back with its id, time and copied values (#202). The
  day's checks apply to it as to a new entry.

## Alternatives considered

- **Totals only, without copies:** each day would be computed from the library as it is now, so
  a corrected BLS value would change what someone ate last month.
- **Copying the totals per entry:** works for the day, but changing the amount would need the
  food's values again, which may have changed in the meantime.
- **A function such as `log_food()`:** keeps the copying in one place too, but the trigger and
  column privileges give the same guarantees while the app keeps using plain inserts, updates and
  deletes, which also suit editing and deleting entries (#202).
- **Meals the user names and orders:** more flexible, but every screen and every suggestion
  (such as a share of the day per meal) would have to handle any number of meals. Four fixed
  meals cover how most people eat; a snack holds the rest.
- **A timestamp instead of a day:** the day would depend on the time zone at read time, and a meal
  logged after midnight for the evening before could not be put on its day.

- **Undo by logging the entry again:** simpler, but it would copy the food's current values, fail
  for a food taken out of the library, and move the entry to the end of its meal.
- **Soft delete with a `removed_at` column:** every read of entries would have to leave removed
  ones out, and they would stay in the table.

## Consequences

- A day's totals are a sum over its few entries; there is no stored total to keep in step.
- A change to the library only affects entries added afterwards.
- Custom foods and recipes will add their own reference columns to `meal_entries`, with a check
  that an entry names exactly one source.
- The 100-entry limit is checked on insert only; moving entries between days within the week can
  exceed it, which is harmless.
- People who log on paper and type it in later cannot go back further than a week.
