import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { totalsOf, type Totals } from './meals';

export type PortionUnit = Database['public']['Enums']['portion_unit'];

export type Portion = { unit: PortionUnit; grams: number };

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
export type FoodRef = { kind: 'library'; id: string } | { kind: 'custom'; id: number };

/** A food as a route parameter: a library code, or "custom-" and the id of one's own. */
export function refKey(ref: FoodRef): string {
  return ref.kind === 'custom' ? `custom-${ref.id}` : ref.id;
}

/** The food a route parameter names, the reverse of `refKey`. */
export function refOf(key: string): FoodRef {
  return key.startsWith('custom-')
    ? { kind: 'custom', id: Number(key.slice('custom-'.length)) }
    : { kind: 'library', id: key };
}

/** The food a row names by its food_id or custom_food_id. */
export function refOfRow(row: { food_id: string | null; custom_food_id: number | null }): FoodRef {
  return row.custom_food_id !== null
    ? { kind: 'custom', id: row.custom_food_id }
    : { kind: 'library', id: row.food_id ?? '' };
}

/** A food found by search, with its values per 100 g and its default portion, if any. */
export type FoodResult = { ref: FoodRef; name: string; per100g: Totals; portion: Portion | null };

/** A food with its values per 100 g and every portion, the default first. */
export type Food = { ref: FoodRef; name: string; per100g: Totals; portions: Portion[] };

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
        portion:
          row.portion_unit !== null && row.portion_grams !== null
            ? { unit: row.portion_unit, grams: row.portion_grams }
            : null,
      }));
    },
  });
}

/**
 * A food with its name in the app language, falling back to English, and its portions. Null when
 * it is not in the library, or no longer, or a food of one's own was deleted.
 */
export function useFood(ref: FoodRef) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['food', i18n.language, refKey(ref)],
    queryFn: async (): Promise<Food | null> =>
      ref.kind === 'custom' ? customFood(ref.id) : libraryFood(ref.id, i18n.language),
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
  return {
    ref: { kind: 'custom', id: data.id },
    name: data.name,
    per100g: totalsOf(data),
    portions:
      data.portion_unit !== null && data.portion_grams !== null
        ? [{ unit: data.portion_unit, grams: data.portion_grams }]
        : [],
  };
}
