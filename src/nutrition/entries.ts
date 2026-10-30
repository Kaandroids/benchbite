import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { STREAK_KEY } from '@/streak/streak';

import { NUTRITION_DAYS_KEY } from './day-nutrition';
import { foodColumns, type Amount, type FoodRef } from './foods';
import { dayEntriesKey, type LoggedEntry, type Meal, type Totals } from './meals';
import { useReloadFoods } from './quick-foods';
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
 * add screen's frequent foods and past meals, which are counted from the entries of any day, the
 * weeks' nutrition, which sums the day up (ADR 0046), and the streak, which counts the day's
 * calories (ADR 0042).
 */
function useReloadDay() {
  const queryClient = useQueryClient();
  return (day: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: dayEntriesKey(day) }),
      queryClient.invalidateQueries({ queryKey: dayTargetsKey(day) }),
      queryClient.invalidateQueries({ queryKey: ['frequent-foods'] }),
      queryClient.invalidateQueries({ queryKey: ['past-meal'] }),
      queryClient.invalidateQueries({ queryKey: NUTRITION_DAYS_KEY }),
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

/** An item of an estimated meal to log: a found food by its reference, or the model's values. */
export type EstimatedEntry = { grams: number } & (
  | { food: FoodRef }
  | {
      /** The name the food is saved by as the user's own, its search name. */
      name: string;
      per100g: Totals;
    }
);

/** What logging an estimated meal added, which its undo takes away again. */
export type LoggedEstimate = {
  day: string;
  /** The entries, in the order of the items. */
  entryIds: number[];
  /** The foods logged, by their reference, including the ones saved as the user's own. */
  foods: FoodRef[];
  /** The user's own foods made for items the library did not have. */
  createdFoodIds: number[];
  /** What the entries add, at the values they were logged with. */
  calories: number;
};

/**
 * Logs a meal estimated from photos in one step (ADR 0060): found foods at their grams, and each
 * item the library did not have as a food of the user's own, by its name, or the one of that
 * name they have.
 */
export function useLogEstimate() {
  const reload = useReloadDay();
  const reloadFoods = useReloadFoods();
  return useMutation({
    mutationFn: async ({
      day,
      meal,
      entries,
    }: {
      day: string;
      meal: Meal;
      entries: EstimatedEntry[];
    }): Promise<LoggedEstimate> => {
      const { data, error } = await supabase.rpc('log_meal_estimate', {
        day,
        meal,
        items: entries.map((entry) =>
          'food' in entry
            ? { ...foodColumns(entry.food), grams: entry.grams }
            : {
                name: entry.name,
                grams: entry.grams,
                kcal: entry.per100g.calories,
                protein_g: entry.per100g.proteinG,
                carbs_g: entry.per100g.carbsG,
                fat_g: entry.per100g.fatG,
              },
        ),
      });
      if (error) {
        throw error;
      }
      return {
        day,
        entryIds: data.map((row) => row.entry_id),
        foods: data.map((row, index) => {
          const entry = entries[index]!;
          return 'food' in entry ? entry.food : { kind: 'custom', id: row.custom_food_id };
        }),
        createdFoodIds: data.flatMap((row) => (row.created_food ? [row.custom_food_id] : [])),
        calories: data.reduce((sum, row) => sum + row.kcal, 0),
      };
    },
    onSuccess: async (logged) => {
      await Promise.all([
        reload(logged.day),
        logged.createdFoodIds.length > 0 ? reloadFoods() : undefined,
      ]);
    },
  });
}

/**
 * Takes back an estimated meal in one step: its entries are removed, and the foods of one's own
 * it made are deleted, or archived when something else names them (ADR 0060).
 */
export function useUndoEstimate() {
  const reload = useReloadDay();
  const reloadFoods = useReloadFoods();
  return useMutation({
    mutationFn: async ({ entryIds, createdFoodIds }: LoggedEstimate) => {
      const { error } = await supabase.rpc('undo_meal_estimate', {
        entry_ids: entryIds,
        food_ids: createdFoodIds,
      });
      if (error) {
        throw error;
      }
    },
    onSuccess: async (_data, { day, createdFoodIds }) => {
      await Promise.all([reload(day), createdFoodIds.length > 0 ? reloadFoods() : undefined]);
    },
  });
}
