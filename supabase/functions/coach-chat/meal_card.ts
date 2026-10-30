// Bite's meal cards (#299, ADR 0062): the meal a card goes to when the user named none, what a card
// logs, and how Bite reads a card back in the history.
import type { MealCard } from '../_shared/coach/chat.ts';
import type { Database } from '../_shared/database.types.ts';
import type { EstimateItem, EstimateMeal } from '../_shared/meal/estimate.ts';

/** Where a card stands, as `coach_meal_cards` has it. */
export type MealCardState = Pick<
  Database['public']['Tables']['coach_meal_cards']['Row'],
  'id' | 'status' | 'kcal'
>;

/**
 * The meal of the time of day, HH:MM on the user's device: breakfast from 4 to 11, lunch to 15,
 * a snack in the afternoon, dinner from 17 to 22, and a snack at night. Without the time, a
 * snack, which the user can move.
 */
export function mealAt(time: string | undefined): EstimateMeal {
  const hour = time ? Number(time.slice(0, 2)) : NaN;
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

/**
 * An item as log_meal_estimate() takes it (ADR 0060): a matched food by its id, and an item the
 * library did not have by its search name, which it is saved as, with the values per 100 g.
 */
export function logItem(item: EstimateItem): Record<string, string | number> {
  const { grams } = item;
  const ref = item.food?.ref;
  if (ref?.kind === 'library') return { food_id: ref.id, grams };
  if (ref?.kind === 'custom') return { custom_food_id: ref.id, grams };
  if (ref?.kind === 'recipe') return { recipe_id: ref.id, grams };
  const { kcal, proteinG, carbsG, fatG } = item.per100;
  return {
    name: item.searchName,
    grams,
    kcal,
    protein_g: proteinG,
    carbs_g: carbsG,
    fat_g: fatG,
  };
}

/** What a card's items add, in whole kcal, at the grams Bite gave. */
export function cardKcal(card: MealCard): number {
  return Math.round(
    card.items.reduce((sum, item) => sum + (item.grams * item.per100.kcal) / 100, 0),
  );
}

/**
 * A card as Bite reads it back in the history, with where it stands when that could be read: the
 * user may have added it with other grams, or undone it.
 */
export function mealCardText(card: MealCard, state?: MealCardState): string {
  const items = card.items.map((item) => `${item.name} ${item.grams} g`).join(', ');
  const status = !state
    ? ''
    : state.status === 'pending'
      ? ' Not added yet.'
      : state.status === 'logged'
        ? ` Added by the user, ${Math.round(state.kcal ?? 0)} kcal.`
        : ' Added, then undone by the user.';
  return `(Meal card for ${card.meal} on ${card.day}: ${items}; ${cardKcal(card)} kcal.${status})`;
}
