// How an estimated item is logged (ADR 0060), shared by Nutrition's meal photo and Bite's meal
// cards, so that both log the same foods at the same values. This file imports only what the app
// can bundle too.
import { nameKey } from '../foods.ts';
import type { EstimateItem } from './estimate.ts';

/** An item as log_meal_estimate() takes it. */
export type LogItem = { grams: number } & (
  | { food_id: string }
  | { custom_food_id: number }
  | { recipe_id: number }
  | { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }
);

/**
 * An item as log_meal_estimate() takes it: a matched food by its id, and an item the library did
 * not have by its search name, which it is saved as, with the values per 100 g. An own food of
 * exactly the search name is logged by its name and values too, as logging makes such a food: it
 * still logs when that food is gone, as when the user undid the meal that made it, or deleted or
 * archived it, and log_meal_estimate() makes it again.
 */
export function logItemOf(item: EstimateItem): LogItem {
  const { grams, food } = item;
  const ref = food?.ref;
  if (ref?.kind === 'library') return { food_id: ref.id, grams };
  if (ref?.kind === 'recipe') return { recipe_id: ref.id, grams };
  const ofName = food && nameKey(food.name) === nameKey(item.searchName);
  if (ref?.kind === 'custom' && !ofName) return { custom_food_id: ref.id, grams };
  const { kcal, proteinG, carbsG, fatG } = item.per100;
  return {
    name: food?.name ?? item.searchName,
    grams,
    kcal,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
  };
}
