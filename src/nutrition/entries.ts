import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { PortionUnit } from './foods';
import { dayEntriesKey, type LoggedEntry, type Meal } from './meals';

/** An amount of a food: grams, and the portion it was picked in, such as 2 slices, if any. */
export type Amount = {
  grams: number;
  /** Left out when grams were entered. */
  portion?: { unit: PortionUnit; count: number } | null;
};

export type NewEntry = Amount & {
  /** YYYY-MM-DD. */
  day: string;
  meal: Meal;
  foodId: string;
};

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
        food_id: entry.foodId,
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
    onSuccess: (_data, { day }) => queryClient.invalidateQueries({ queryKey: dayEntriesKey(day) }),
  });
}

/** Removes an entry from its day. */
export function useRemoveEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: LoggedEntry) => {
      const { error } = await supabase.from('meal_entries').delete().eq('id', entry.id);
      if (error) {
        throw error;
      }
    },
    onSuccess: (_data, entry) =>
      queryClient.invalidateQueries({ queryKey: dayEntriesKey(entry.day) }),
  });
}

/**
 * The entry to log again when its removal is undone. It is logged anew, so it copies the food's
 * values again, which are the same unless the library changed in between.
 */
export function restoreOf(entry: LoggedEntry): NewEntry {
  return {
    day: entry.day,
    meal: entry.meal,
    foodId: entry.foodId,
    grams: entry.grams,
    portion: entry.portion,
  };
}

// The entry removed last on the entry screen, which the meal screen offers to undo when it shows
// again. The entry screen is a screen of its own, so it hands the entry back this way.
let removed: LoggedEntry | null = null;

export function setRemovedEntry(entry: LoggedEntry) {
  removed = entry;
}

/** The entry removed since the meal screen last asked, once. */
export function takeRemovedEntry(): LoggedEntry | null {
  const entry = removed;
  removed = null;
  return entry;
}
