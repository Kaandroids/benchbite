// What Bite's proposals of a recipe and of changes to the favourites (ADR 0172) need of the foods:
// the food each name Bite gives is, as search_foods() names it, the favourites, and the cards.
import type {
  CardFavourite,
  CardIngredient,
  PortionUnit,
  ProposalCard,
} from '../_shared/coach/chat.ts';
import { nameKey, refOfRow, tenth } from '../_shared/foods.ts';
import { type FoundFood, searchOnce } from '../_shared/meal/match.ts';
import type { Language } from '../_shared/prompt.ts';
import type { Client } from '../_shared/supabase.ts';

/** A food as a proposal names it, as the database does: by exactly one of its ids. */
export type FoodId =
  | { foodId: string }
  | { customFoodId: number }
  | {
      recipeId: number;
    };

export function foodIdOf(food: FoundFood): FoodId {
  const ref = refOfRow(food);
  switch (ref.kind) {
    case 'recipe':
      return { recipeId: ref.id };
    case 'custom':
      return { customFoodId: ref.id };
    case 'library':
      return { foodId: ref.id };
  }
}

/** Whether two rows are the same food. */
export function isSameFood(a: FoundFood, b: FoundFood): boolean {
  const [x, y] = [refOfRow(a), refOfRow(b)];
  return x.kind === y.kind && x.id === y.id;
}

/**
 * The food each of `names` is, of those search_foods() finds for it, as the user: one whose name
 * is that name, compared as the search compares names, that `takes`; none when there is no such
 * food. Bite gives the names search_foods gave it, so a name that only starts alike is another
 * food.
 */
export async function foodsNamed(
  supabase: Client,
  language: Language,
  names: string[],
  takes: (food: FoundFood) => boolean = () => true,
): Promise<(FoundFood | undefined)[]> {
  const search = searchOnce(supabase, language);
  const found = await Promise.all(names.map((name) => search(name.trim())));
  return names.map((name, index) =>
    found[index]!.find((food) => takes(food) && nameKey(food.name) === nameKey(name)),
  );
}

/** The user's favourites that can still be logged, newest first. */
export async function favouriteFoods(supabase: Client, language: Language): Promise<FoundFood[]> {
  const { data, error } = await supabase.rpc('list_favourite_foods', {
    language,
  });
  if (error) throw error;
  return data as FoundFood[];
}

/** An ingredient of a recipe Bite proposes: its food, its grams, and the portion picked, if one. */
export type RecipeIngredient = {
  food: FoundFood;
  grams: number;
  portion?: { unit: PortionUnit; count: number };
};

/**
 * The card of a recipe: each ingredient with its calories, and one serving, the whole weight and
 * values shared out, as recipe_values sums them.
 */
export function recipeCard(
  id: number,
  recipe: { name: string; servings: number; servingUnit: PortionUnit },
  ingredients: RecipeIngredient[],
): Extract<ProposalCard, { kind: 'recipe' }> {
  const total = (value: (food: FoundFood) => number) =>
    ingredients.reduce((sum, { food, grams }) => sum + (grams * value(food)) / 100, 0);
  const perServing = (value: number) => tenth(value / recipe.servings);
  return {
    kind: 'recipe',
    id,
    name: recipe.name.trim(),
    servings: recipe.servings,
    servingUnit: recipe.servingUnit,
    ingredients: ingredients.map(({ food, grams, portion }): CardIngredient => ({
      name: food.name,
      grams,
      kcal: tenth((grams * food.kcal) / 100),
      ...(portion && { portion }),
    })),
    serving: {
      grams: perServing(ingredients.reduce((sum, { grams }) => sum + grams, 0)),
      kcal: perServing(total((food) => food.kcal)),
      proteinG: perServing(total((food) => food.protein_g)),
      carbsG: perServing(total((food) => food.carbs_g)),
      fatG: perServing(total((food) => food.fat_g)),
    },
  };
}

/** A food a favourites card adds or takes out: per 100 g, or per serving for a recipe. */
export function favouriteOf(food: FoundFood, add: boolean): CardFavourite {
  if (food.recipe_id !== null && food.portion_unit && food.portion_grams) {
    return {
      name: food.name,
      add,
      kcal: Math.round((food.kcal * food.portion_grams) / 100),
      serving: food.portion_unit,
    };
  }
  return { name: food.name, add, kcal: Math.round(food.kcal) };
}
