import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { STREAK_KEY } from '@/streak/streak';

import { foodColumns, type Amount, type FoodRef } from './foods';
import { dayEntriesKey, type LoggedEntry, type Meal } from './meals';
import { dayTargetsKey } from './targets';

export type NewEntry = Amount & {
  /** YYYY-MM-DD. */
  day: string;
  meal: Meal;
  food: FoodRef;
};

/** An amount as the meal_entries columns hold it. */
function amountColumns({ grams, portion }: Amount) {
  return { grams, portion_unit: portion?.unit ?? null, portion_count: portion?.count ?? null };
}

/**
 * Loads a day's entries again, with the targets the day kept from its first entry (ADR 0040), the
 * add screen's frequent foods and past meals, which are counted from the entries of any day, and
 * the streak, which counts the day's calories (ADR 0042).
 */
function useReloadDay() {
  const queryClient = useQueryClient();
  return (day: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dayEntriesKey(day) }),
      queryClient.invalidateQueries({ queryKey: dayTargetsKey(day) }),
      queryClient.invalidateQueries({ queryKey: ['frequent-foods'] }),
      queryClient.invalidateQueries({ queryKey: ['past-meal'] }),
      queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
    ]);
}

/**
 * Logs a food to a meal. The database copies the food's values and checks the day (ADR 0034);
 * the day's entries are loaded again.
 */
export function useAddEntry() {
  const reload = useReloadDay();
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
    onSuccess: (_data, entry) => reload(entry.day),
  });
}

/**
 * Changes how much of a food an entry holds. Its copied values stay, so what it adds follows the
 * values it was logged with.
 */
export function useUpdateEntry() {
  const reload = useReloadDay();
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
      void reload(day);
    },
  });
}

/** Removes an entry from its day. It can be restored for an hour. */
export function useRemoveEntry() {
  const reload = useReloadDay();
  return useMutation({
    mutationFn: async (entry: LoggedEntry) => {
      const { error } = await supabase.from('meal_entries').delete().eq('id', entry.id);
      if (error) {
        throw error;
      }
    },
    // Not waited for, so that the screen that removed it can go back before its day reloads.
    onSuccess: (_data, entry) => {
      void reload(entry.day);
    },
  });
}

/**
 * Puts a removed entry back as it was, with its time and copied values, within an hour of its
 * removal. The database keeps it for that long.
 */
export function useRestoreEntry() {
  const reload = useReloadDay();
  return useMutation({
    mutationFn: async (entry: LoggedEntry) => {
      const { error } = await supabase.rpc('restore_meal_entry', { entry_id: entry.id });
      if (error) {
        throw error;
      }
    },
    onSuccess: (_data, entry) => reload(entry.day),
  });
}

/**
 * Adds copies of entries, such as the foods picked from a past meal, to a meal of a day in one
 * step, with the same amounts (ADR 0037). Gives how many were added; foods that can no longer be
 * logged are left out.
 */
export function useCopyEntries() {
  const reload = useReloadDay();
  return useMutation({
    mutationFn: async ({ ids, day, meal }: { ids: number[]; day: string; meal: Meal }) => {
      const { data, error } = await supabase.rpc('copy_meal_entries', {
        entry_ids: ids,
        to_day: day,
        to_meal: meal,
      });
      if (error) {
        throw error;
      }
      return data;
    },
    onSuccess: (_data, { day }) => reload(day),
  });
}
