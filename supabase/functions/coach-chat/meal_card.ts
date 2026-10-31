// Bite's meal cards (#299, ADR 0062): a card in a tool's result and where it stands, the meal a card
// goes to when the user named none, and how Bite reads a card back in the history.
import type { MealCard } from '../_shared/coach/chat.ts';
import type { Database } from '../_shared/database.types.ts';
import type { EstimateMeal } from '../_shared/meal/estimate.ts';
import { type Client, logError } from '../_shared/supabase.ts';

/** Where a card stands, as `coach_meal_cards` has it. */
export type MealCardState = Pick<
  Database['public']['Tables']['coach_meal_cards']['Row'],
  'id' | 'status' | 'kcal'
>;

/** The card of a meal Bite estimated, as its tool's result holds it. */
export function mealCardOf(result: unknown): MealCard | undefined {
  return (result as { mealCard?: MealCard } | null)?.mealCard;
}

/**
 * Where the meal cards among the tool `results` of a thread stand, by id, as the user reads them;
 * none when they cannot be read, and Bite then reads the cards without.
 */
export async function mealCardStates(
  supabase: Client,
  results: unknown[],
): Promise<Map<number, MealCardState>> {
  const ids = results.flatMap((result) => {
    const card = mealCardOf(result);
    return card ? [card.id] : [];
  });
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('coach_meal_cards')
    .select('id, status, kcal')
    .in('id', ids);
  if (error) {
    logError('Could not read the meal cards of a thread', error);
    return new Map();
  }
  return new Map(data.map((state) => [state.id, state]));
}

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
