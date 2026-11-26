// What Bite's proposals of a recipe and of changes to the favourites (ADR 0172) need of the foods:
// the food each name Bite gives is, as search_foods() names it, the favourites, and the cards.
import type {
  CardFavourite,
  CardIngredient,
  PortionUnit,
  ProposalCard,
} from '../_shared/coach/chat.ts';
import type { Database } from '../_shared/database.types.ts';
import { FOOD_QUERY_LENGTH, nameKey } from '../_shared/foods.ts';
import type { Language } from '../_shared/prompt.ts';
import type { Client } from '../_shared/supabase.ts';

/**
 * A food as search_foods() and list_favourite_foods() give it, by exactly one of its ids, and
 * with its portion or none, which the generated types do not mark as nullable.
 */
export type FoundFood = Omit<
  Database['public']['Functions']['search_foods']['Returns'][number],
  'food_id' | 'custom_food_id' | 'recipe_id' | 'portion_unit' | 'portion_grams'
> & {
  food_id: string | null;
  custom_food_id: number | null;
  recipe_id: number | null;
  portion_unit: PortionUnit | null;
  portion_grams: number | null;
};

/** A food as a proposal names it, as the database does: by exactly one of its ids. */
export type FoodId =
  | { foodId: string }
  | { customFoodId: number }
  | {
      recipeId: number;
    };

export function foodIdOf(food: FoundFood): FoodId {
  if (food.recipe_id !== null) return { recipeId: food.recipe_id };
  if (food.custom_food_id !== null) {
    return { customFoodId: food.custom_food_id };
  }
  return { foodId: food.food_id ?? '' };
}

/** Whether two rows are the same food. */
export function isSameFood(a: FoundFood, b: FoundFood): boolean {
  return (
    a.food_id === b.food_id && a.custom_food_id === b.custom_food_id && a.recipe_id === b.recipe_id
  );
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
  const found = await Promise.all(
    names.map(async (name) => {
      const query = name.trim();
      if (query.length < FOOD_QUERY_LENGTH.min || query.length > FOOD_QUERY_LENGTH.max) return [];
      const { data, error } = await supabase.rpc('search_foods', {
        language,
        query,
      });
      if (error) throw error;
      return data as FoundFood[];
    }),
  );
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

/** Grams as an ingredient keeps them, to a tenth (numeric(6, 1)). */
export function ingredientGrams(grams: number): number {
  return Math.round(grams * 10) / 10;
}

const tenth = (value: number) => Math.round(value * 10) / 10;

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
