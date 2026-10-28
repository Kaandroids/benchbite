import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { totalsOf, type Totals } from './meals';

export type PortionUnit = Database['public']['Enums']['portion_unit'];

export type Portion = { unit: PortionUnit; grams: number };

/** A portion from a row's nullable unit and grams, or null when it has none. */
export function portionOf(unit: PortionUnit | null, grams: number | null): Portion | null {
  return unit !== null && grams !== null ? { unit, grams } : null;
}

/** A number of portions, such as 2 slices. */
export type PickedPortion = { unit: PortionUnit; count: number };

/** An amount of a food: grams, and the portions they were picked in, or null for grams. */
export type Amount = { grams: number; portion: PickedPortion | null };

/** A food's name in a language, falling back to English, then to its id (ADR 0035). */
export function nameOf(
  names: { language: string; name: string }[],
  language: string,
  id: string,
): string {
  const nameIn = (code: string) => names.find((name) => name.language === code)?.name;
  return nameIn(language) ?? nameIn('en') ?? id;
}

/** A food of the library, by its BLS code, or one of the user's own, by its id (ADR 0036). */
export type FoodRef =
  { kind: 'library'; id: string } | { kind: 'custom'; id: number } | { kind: 'recipe'; id: number };

/** A food as a route parameter: a library code, or "custom-" or "recipe-" and an id. */
export function refKey(ref: FoodRef): string {
  return ref.kind === 'library' ? ref.id : `${ref.kind}-${ref.id}`;
}

/** The food a route parameter names, the reverse of `refKey`. */
export function refOf(key: string): FoodRef {
  for (const kind of ['custom', 'recipe'] as const) {
    if (key.startsWith(`${kind}-`)) {
      return { kind, id: Number(key.slice(kind.length + 1)) };
    }
  }
  return { kind: 'library', id: key };
}

/** The food a row names by its food_id, custom_food_id or recipe_id (ADR 0038). */
export function refOfRow(row: {
  food_id: string | null;
  custom_food_id: number | null;
  recipe_id?: number | null;
}): FoodRef {
  if (row.recipe_id !== undefined && row.recipe_id !== null) {
    return { kind: 'recipe', id: row.recipe_id };
  }
  return row.custom_food_id !== null
    ? { kind: 'custom', id: row.custom_food_id }
    : { kind: 'library', id: row.food_id ?? '' };
}

/** A food as the columns of entries and favourites name it: exactly one of the three is set. */
export function foodColumns(food: FoodRef): {
  food_id: string | null;
  custom_food_id: number | null;
  recipe_id: number | null;
} {
  return {
    food_id: food.kind === 'library' ? food.id : null,
    custom_food_id: food.kind === 'custom' ? food.id : null,
    recipe_id: food.kind === 'recipe' ? food.id : null,
  };
}

/** A food found by search, with its values per 100 g and its default portion, if any. */
export type FoodResult = { ref: FoodRef; name: string; per100g: Totals; portion: Portion | null };

/** A food with its values per 100 g and every portion, the default first. */
export type Food = { ref: FoodRef; name: string; per100g: Totals; portions: Portion[] };

/** The amount of a food without a portion, when nothing else is chosen. */
export const DEFAULT_GRAMS = 100;

/** How long typing pauses before a search is sent. */
export const SEARCH_DELAY_MS = 250;

/** The shortest query searched; search_foods finds nothing below it. */
export const MIN_QUERY_LENGTH = 2;

/** What an amount of a food adds, from its values per 100 g. */
export function amountOf(per100g: Totals, grams: number): Totals {
  return {
    calories: (per100g.calories * grams) / 100,
    proteinG: (per100g.proteinG * grams) / 100,
    carbsG: (per100g.carbsG * grams) / 100,
    fatG: (per100g.fatG * grams) / 100,
  };
}

/** A typed query once typing has paused for `SEARCH_DELAY_MS`, so a search is not sent per key. */
export function useSettledQuery(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

/**
 * Searches the food library by name in the app language and in English, and the user's own foods
 * (ADR 0035, 0036). The last results stay while the next ones load. Nothing is searched below
 * `MIN_QUERY_LENGTH`.
 */
export function useFoodSearch(term: string) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['food-search', i18n.language, term],
    enabled: term.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FoodResult[]> => {
      const { data, error } = await supabase.rpc('search_foods', {
        query: term,
        language: i18n.language,
      });
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

/**
 * A food with its name in the app language, falling back to English, and its portions. Null when
 * it is not in the library, or no longer, or a food or recipe of one's own was deleted. A recipe's
 * portion is one serving.
 */
export function useFood(ref: FoodRef) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['food', i18n.language, refKey(ref)],
    queryFn: async (): Promise<Food | null> => {
      switch (ref.kind) {
        case 'library':
          return libraryFood(ref.id, i18n.language);
        case 'custom':
          return customFood(ref.id);
        case 'recipe':
          return recipeFood(ref.id);
      }
    },
  });
}

async function libraryFood(id: string, language: string): Promise<Food | null> {
  const { data, error } = await supabase
    .from('foods')
    .select(
      'id, kcal, protein_g, carbs_g, fat_g, archived_at, food_names(language, name), food_portions(unit, grams, is_default)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  // A food taken out of the library cannot be logged any more (ADR 0034).
  if (!data || data.archived_at !== null) {
    return null;
  }
  return {
    ref: { kind: 'library', id: data.id },
    name: nameOf(data.food_names, language, data.id),
    per100g: totalsOf(data),
    portions: [...data.food_portions]
      .sort((a, b) => Number(b.is_default) - Number(a.is_default))
      .map(({ unit, grams }) => ({ unit, grams })),
  };
}

async function customFood(id: number): Promise<Food | null> {
  const { data, error } = await supabase
    .from('custom_foods')
    .select('id, name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams, archived_at')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data || data.archived_at !== null) {
    return null;
  }
  const portion = portionOf(data.portion_unit, data.portion_grams);
  return {
    ref: { kind: 'custom', id: data.id },
    name: data.name,
    per100g: totalsOf(data),
    portions: portion ? [portion] : [],
  };
}

async function recipeFood(id: number): Promise<Food | null> {
  const [recipe, values] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, name, servings, serving_unit, archived_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('recipe_values')
      .select('grams, kcal, protein_g, carbs_g, fat_g')
      .eq('recipe_id', id)
      .maybeSingle(),
  ]);
  if (recipe.error) {
    throw recipe.error;
  }
  if (values.error) {
    throw values.error;
  }
  if (!recipe.data || recipe.data.archived_at !== null || !values.data) {
    return null;
  }
  return {
    ref: { kind: 'recipe', id: recipe.data.id },
    name: recipe.data.name,
    per100g: totalsOf(values.data),
    portions: [
      {
        unit: recipe.data.serving_unit,
        grams: Math.round(((values.data.grams ?? 0) / recipe.data.servings) * 10) / 10,
      },
    ],
  };
}
