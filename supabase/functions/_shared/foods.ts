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
 * How long a recipe's name may be, how many servings it makes and ingredients it has, what an
 * ingredient and a serving weigh at most, as `recipes`, `recipe_ingredients` and save_recipe()
 * allow (ADR 0038). A mirror of the checks in migrations 20261028150000_recipes.sql and
 * 20261126100100_recipe_and_favourite_proposals.sql, which must change with them.
 */
export const MAX_RECIPE_NAME = 120;
export const MAX_SERVINGS = 50;
export const MAX_INGREDIENTS = 50;
export const MAX_INGREDIENT_GRAMS = 5000;
/** The most a serving weighs, as an entry holds at most this much. */
export const MAX_SERVING_GRAMS = 5000;

/** A value to a tenth, as the food library and a recipe's ingredients keep values (numeric(6, 1)). */
export function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A food's name as search_foods() and log_meal_estimate() compare it: a mirror of food_name_key()
 * in the database, which lowercases after making the Turkish dotted and dotless i a plain i.
 */
export function foodNameKey(name: string): string {
  return name.replace(/[İı]/g, 'i').toLowerCase();
}

/** A food's name as foodNameKey() gives it, trimmed, as a search term or an estimate's name is. */
export function nameKey(name: string): string {
  return foodNameKey(name).trim();
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
