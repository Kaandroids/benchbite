import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { totalsOf, type Totals } from './meals';

export type PortionUnit = Database['public']['Enums']['portion_unit'];

export type Portion = { unit: PortionUnit; grams: number };

/** A food found by search, with its values per 100 g and its default portion. */
export type FoodResult = { id: string; name: string; per100g: Totals; portion: Portion };

/** A food of the library, with its values per 100 g and every portion, the default first. */
export type Food = { id: string; name: string; per100g: Totals; portions: Portion[] };

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
 * Searches the food library by name in the app language and in English (ADR 0035). The last
 * results stay while the next ones load. Nothing is searched below `MIN_QUERY_LENGTH`.
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
        id: row.food_id,
        name: row.name,
        per100g: totalsOf(row),
        portion: { unit: row.portion_unit, grams: row.portion_grams },
      }));
    },
  });
}

/**
 * A food with its name in the app language, falling back to English, and its portions. Null when
 * it is not in the library, or no longer.
 */
export function useFood(id: string) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['food', i18n.language, id],
    queryFn: async (): Promise<Food | null> => {
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
      const nameIn = (language: string) =>
        data.food_names.find((name) => name.language === language)?.name;
      return {
        id: data.id,
        name: nameIn(i18n.language) ?? nameIn('en') ?? data.id,
        per100g: totalsOf(data),
        portions: [...data.food_portions]
          .sort((a, b) => Number(b.is_default) - Number(a.is_default))
          .map(({ unit, grams }) => ({ unit, grams })),
      };
    },
  });
}
