import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

import {
  amountOf,
  nameOf,
  portionOf,
  refOfRow,
  type Amount,
  type FoodRef,
  type FoodResult,
  type PortionUnit,
} from './foods';
import { NOTHING, totalOf, totalsOf, type Totals } from './meals';
import { QUICK_FOOD_KEYS } from './quick-foods';

/** How many servings a recipe makes at most, and how many ingredients it has, as the database allows. */
export const MAX_SERVINGS = 50;
export const MAX_INGREDIENTS = 50;

/** The most a serving weighs, as an entry holds at most this much (ADR 0038). */
export const MAX_SERVING_GRAMS = 5000;

/** An ingredient: a library food or one of one's own, with how much of it goes in. */
export type Ingredient = Amount & {
  food: Extract<FoodRef, { kind: 'library' | 'custom' }>;
  name: string;
  /** The food's values per 100 g now, which the recipe's are summed from. */
  per100g: Totals;
};

/** A recipe as the form edits it. */
export type RecipeValues = {
  name: string;
  servings: number;
  servingUnit: PortionUnit;
  ingredients: Ingredient[];
};

export type Recipe = RecipeValues & { id: number };

/** What a recipe weighs and holds in all, and in one serving. */
export function recipeTotals({
  servings,
  ingredients,
}: Pick<RecipeValues, 'servings' | 'ingredients'>) {
  const grams = ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0);
  const total = totalOf(
    ingredients.map((ingredient) => amountOf(ingredient.per100g, ingredient.grams)),
  );
  const share = (value: number) => value / Math.max(servings, 1);
  return {
    grams,
    total,
    servingGrams: share(grams),
    serving: {
      calories: share(total.calories),
      proteinG: share(total.proteinG),
      carbsG: share(total.carbsG),
      fatG: share(total.fatG),
    },
  };
}

/** A recipe of the signed-in user with its ingredients in order, or null when it was deleted. */
export function useRecipe(id: number) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['recipe', id, i18n.language],
    queryFn: async (): Promise<Recipe | null> => {
      const { data, error } = await supabase
        .from('recipes')
        .select(
          'id, name, servings, serving_unit, archived_at, recipe_ingredients(position, food_id, custom_food_id, grams, portion_unit, portion_count, foods(kcal, protein_g, carbs_g, fat_g, food_names(language, name)), custom_foods(name, kcal, protein_g, carbs_g, fat_g))',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data || data.archived_at !== null) {
        return null;
      }
      return {
        id: data.id,
        name: data.name,
        servings: data.servings,
        servingUnit: data.serving_unit,
        ingredients: [...data.recipe_ingredients]
          .sort((a, b) => a.position - b.position)
          .map((row) => {
            const food = row.custom_foods ?? row.foods;
            return {
              food: refOfRow(row) as Ingredient['food'],
              name:
                row.custom_foods?.name ??
                nameOf(row.foods?.food_names ?? [], i18n.language, row.food_id ?? ''),
              per100g: food ? totalsOf(food) : NOTHING,
              grams: row.grams,
              portion:
                row.portion_unit !== null && row.portion_count !== null
                  ? { unit: row.portion_unit, count: row.portion_count }
                  : null,
            };
          }),
      };
    },
  });
}

/** The user's recipes that can be logged, by name, each with one serving as its portion. */
export function useRecipes() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['recipes', i18n.language],
    queryFn: async (): Promise<FoodResult[]> => {
      const { data, error } = await supabase
        .rpc('loggable_foods', { language: i18n.language })
        .not('recipe_id', 'is', null)
        .order('name');
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        ref: refOfRow(row),
        name: row.name,
        per100g: totalsOf(row),
        portion: portionOf(row.portion_unit, row.portion_grams),
      }));
    },
  });
}

/** Everything that shows a recipe: the lists, search, its own screens and the days. */
function useReloadRecipes() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['recipe'], ['food'], ['food-search'], ['meal-entries'], ...QUICK_FOOD_KEYS].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

/**
 * Adds a recipe, or changes one with `id`, with all its ingredients in one step, and gives its id
 * (ADR 0038). Past entries keep the values they copied.
 */
export function useSaveRecipe() {
  const reload = useReloadRecipes();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: number; values: RecipeValues }): Promise<number> => {
      const { data, error } = await supabase.rpc('save_recipe', {
        // The generated types do not know that the function takes null for a new recipe.
        recipe_id: (id ?? null) as number,
        name: values.name,
        servings: values.servings,
        serving_unit: values.servingUnit,
        ingredients: values.ingredients.map(({ food, grams, portion }) => ({
          [food.kind === 'custom' ? 'custom_food_id' : 'food_id']: food.id,
          grams,
          portion_unit: portion?.unit ?? null,
          portion_count: portion?.count ?? null,
        })),
      });
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: reload,
  });
}

/** Deletes a recipe: it is archived, so that past entries keep it (ADR 0038). */
export function useDeleteRecipe() {
  const reload = useReloadRecipes();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('recipes')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        throw error;
      }
    },
    // Not waited for, so that the screen leaves before the recipe it shows reloads as deleted.
    onSuccess: () => {
      void reload();
    },
  });
}
