import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { Amount, FoodRef } from './foods';
import { dayEntriesKey, type LoggedEntry, type Meal } from './meals';

export type NewEntry = Amount & {
  /** YYYY-MM-DD. */
  day: string;
  meal: Meal;
  food: FoodRef;
};

/** A food as the meal_entries columns name it: a library food or one of one's own. */
function foodColumns(food: FoodRef) {
  return food.kind === 'custom'
    ? { food_id: null, custom_food_id: food.id }
    : { food_id: food.id, custom_food_id: null };
}

/** An amount as the meal_entries columns hold it. */
function amountColumns({ grams, portion }: Amount) {
  return { grams, portion_unit: portion?.unit ?? null, portion_count: portion?.count ?? null };
}

/**
 * Logs a food to a meal. The database copies the food's values and checks the day (ADR 0034);
 * the day's entries are loaded again.
 */
export function useAddEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: NewEntry) => {
      const { error } = await supabase.from('meal_entries').insert({
        day: entry.day,
        meal: entry.meal,
        ...foodColumns(entry.food),
        ...amountColumns(entry),
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: (_data, entry) =>
      queryClient.invalidateQueries({ queryKey: dayEntriesKey(entry.day) }),
  });
}

/**
 * Changes how much of a food an entry holds. Its copied values stay, so what it adds follows the
 * values it was logged with.
 */
export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: number; day: string; amount: Amount }) => {
      const { error } = await supabase
        .from('meal_entries')
        .update(amountColumns(amount))
        .eq('id', id);
      if (error) {
        throw error;
      }
    },
    // Not waited for, so that the screen that changed it can go back before its day reloads.
    onSuccess: (_data, { day }) => {
      void queryClient.invalidateQueries({ queryKey: dayEntriesKey(day) });
    },
  });
}

/** Removes an entry from its day. It can be restored for an hour. */
export function useRemoveEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: LoggedEntry) => {
      const { error } = await supabase.from('meal_entries').delete().eq('id', entry.id);
      if (error) {
        throw error;
      }
    },
    // Not waited for, so that the screen that removed it can go back before its day reloads.
    onSuccess: (_data, entry) => {
      void queryClient.invalidateQueries({ queryKey: dayEntriesKey(entry.day) });
    },
  });
}

/**
 * Puts a removed entry back as it was, with its time and copied values, within an hour of its
 * removal. The database keeps it for that long.
 */
export function useRestoreEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: LoggedEntry) => {
      const { error } = await supabase.rpc('restore_meal_entry', { entry_id: entry.id });
      if (error) {
        throw error;
      }
    },
    onSuccess: (_data, entry) =>
      queryClient.invalidateQueries({ queryKey: dayEntriesKey(entry.day) }),
  });
}
