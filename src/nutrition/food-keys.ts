/**
 * The query keys of the food log and of the foods and recipes it shows, in one module of their
 * own, so that what reloads them, as changing a food reloads every screen that shows it, names
 * the same keys without importing the queries.
 */
export const FOOD_SEARCH_KEY = ['food-search'];
export const FOOD_KEY = ['food'];
export const RECIPE_KEY = ['recipe'];
export const RECIPES_KEY = ['recipes'];
/** The entries of the food log, by day. */
export const ENTRIES_KEY = ['meal-entries'];
/** A meal logged before, to log again. */
export const PAST_MEAL_KEY = ['past-meal'];
/** The foods the user logs often, marks as favourites, and made. */
export const FREQUENT_FOODS_KEY = ['frequent-foods'];
export const FAVOURITE_FOODS_KEY = ['favourite-foods'];
export const MY_FOODS_KEY = ['my-foods'];
