import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';

import {
  columnOf,
  foodColumns,
  pickedPortionOf,
  portionOf,
  refKey,
  refOfRow,
  type Amount,
  type FoodRef,
  type FoodResult,
} from './foods';
import { totalsOf, type Meal } from './meals';

/** A food logged often at a meal: how often, and the amount it was logged with last. */
export type FrequentFood = FoodResult & { times: number; amount: Amount };

/** The query keys of the lists of the add screen. */
export const QUICK_FOOD_KEYS = [['frequent-foods'], ['favourite-foods'], ['my-foods'], ['recipes']];

/**
 * Everything that shows a food or a recipe by its name or values: search, the food and recipe
 * screens, the days, the past meals and the add screen's lists. Changing or deleting one reloads
 * them all.
 */
export function reloadFoods(queryClient: QueryClient) {
  return Promise.all(
    [
      ['food-search'],
      ['food'],
      ['recipe'],
      ['meal-entries'],
      ['past-meal'],
      ...QUICK_FOOD_KEYS,
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/** `reloadFoods`, for a mutation. */
export function useReloadFoods() {
  const queryClient = useQueryClient();
  return () => reloadFoods(queryClient);
}

/** The foods the user logged most at a meal in the last 90 days (ADR 0037). */
export function useFrequentFoods(meal: Meal) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['frequent-foods', meal, i18n.language],
    queryFn: async (): Promise<FrequentFood[]> => {
      const { data, error } = await supabase.rpc('frequent_foods', {
        for_meal: meal,
        language: i18n.language,
      });
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        ref: refOfRow(row),
        name: row.name,
        per100g: totalsOf(row),
        portion: null,
        times: row.times,
        amount: {
          grams: row.grams,
          portion: pickedPortionOf(row.portion_unit, row.portion_count),
        },
      }));
    },
  });
}

/** The user's favourite foods that can still be logged, newest first. */
export function useFavouriteFoods() {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: ['favourite-foods', i18n.language],
    queryFn: async (): Promise<FoodResult[]> => {
      const { data, error } = await supabase.rpc('list_favourite_foods', {
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

/** Whether a food is a favourite, by `refKey`, from the favourites loaded. */
export function useFavouriteKeys(): Set<string> {
  const favourites = useFavouriteFoods();
  return new Set((favourites.data ?? []).map((food) => refKey(food.ref)));
}

/**
 * Stars a food or takes its star away. Starring one already starred, say from another device,
 * counts as done.
 */
export function useSetFavourite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ food, favourite }: { food: FoodRef; favourite: boolean }) => {
      if (favourite) {
        const { error } = await supabase.from('favourite_foods').insert(foodColumns(food));
        if (error && error.code !== '23505') {
          throw error;
        }
        return;
      }
      // By the one column that names the food: an equal filter on the others, null, matches
      // nothing.
      const { error } = await supabase.from('favourite_foods').delete().eq(columnOf(food), food.id);
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['favourite-foods'] }),
  });
}

/** The user's own foods that can still be logged, by name. */
export function useMyFoods() {
  return useQuery({
    queryKey: ['my-foods'],
    queryFn: async (): Promise<FoodResult[]> => {
      const { data, error } = await supabase
        .from('custom_foods')
        .select('id, name, kcal, protein_g, carbs_g, fat_g, portion_unit, portion_grams')
        .is('archived_at', null)
        .order('name');
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        ref: { kind: 'custom', id: row.id },
        name: row.name,
        per100g: totalsOf(row),
        portion: portionOf(row.portion_unit, row.portion_grams),
      }));
    },
  });
}
