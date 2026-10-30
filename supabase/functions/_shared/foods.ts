// Foods as the app and the functions both name them, and what the food search takes, mirrored
// from the database so that the functions keep to it. This file imports nothing, so that the app
// can bundle it.

/**
 * The shortest and longest query search_foods() searches, after trimming; it finds nothing for
 * any other. A mirror of the `length(s.term) between 2 and 50` in search_foods() (migration
 * 20261028170000_search_without_recipes.sql), which must change with it.
 */
export const FOOD_QUERY_LENGTH = { min: 2, max: 50 } as const;

/**
 * A food's name as search_foods() compares it: a mirror of food_name_key() in the database, which
 * lowercases after making the Turkish dotted and dotless i a plain i.
 */
export function foodNameKey(name: string): string {
  return name.replace(/[İı]/g, 'i').toLowerCase();
}

/**
 * A food of the library, by its BLS code, or one of the user's own foods or recipes, by its id
 * (ADR 0036, ADR 0038), as a meal entry names it by its food_id, custom_food_id or recipe_id.
 */
export type FoodRef =
  { kind: 'library'; id: string } | { kind: 'custom'; id: number } | { kind: 'recipe'; id: number };

/**
 * The food a row names by its food_id, custom_food_id or recipe_id (ADR 0038). The database sets
 * exactly one of them (meal_entries_one_food, search_foods()); a row with none, which cannot
 * come, is taken as a library food without a code rather than failing.
 */
export function refOfRow(row: {
  food_id: string | null;
  custom_food_id: number | null;
  recipe_id: number | null;
}): FoodRef {
  if (row.recipe_id !== null) {
    return { kind: 'recipe', id: row.recipe_id };
  }
  return row.custom_food_id !== null
    ? { kind: 'custom', id: row.custom_food_id }
    : { kind: 'library', id: row.food_id ?? '' };
}
