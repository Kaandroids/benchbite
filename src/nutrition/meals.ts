import { useQuery } from '@tanstack/react-query';

import type { IconName } from '@/components/ui/icon';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import type { NutritionTargets } from './targets';

export type Meal = Database['public']['Enums']['meal'];

/** What a meal or a day adds up to, in the units of the targets. */
export type Totals = NutritionTargets;

/** How many days before today meals can be logged; the database allows the same (ADR 0034). */
export const LOGGABLE_DAYS = 7;

/**
 * The meals in the order of the day, with their icon and the share of the day's calories they
 * usually take, which suggests how much is left for an empty one.
 */
export const MEALS: { meal: Meal; icon: IconName; share: number }[] = [
  { meal: 'breakfast', icon: 'sunrise', share: 0.25 },
  { meal: 'lunch', icon: 'sun', share: 0.35 },
  { meal: 'dinner', icon: 'moon', share: 0.3 },
  { meal: 'snack', icon: 'snack', share: 0.1 },
];

export type MealEntry = { meal: Meal } & Totals;

export const NOTHING: Totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

function add(a: Totals, b: Totals): Totals {
  return {
    calories: a.calories + b.calories,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

/** What the entries add up to. */
export function totalOf(entries: Totals[]): Totals {
  return entries.reduce(add, NOTHING);
}

export type MealSummary = { meal: Meal; items: number; totals: Totals };

/** Every meal with its number of entries and what they add up to, empty ones too. */
export function mealsOf(entries: MealEntry[]): MealSummary[] {
  return MEALS.map(({ meal }) => {
    const items = entries.filter((entry) => entry.meal === meal);
    return { meal, items: items.length, totals: totalOf(items) };
  });
}

/**
 * The calories suggested for each empty meal: what is left of the day, split between the empty
 * meals by their usual shares. Nothing is suggested once the day's calories are used up.
 */
export function suggestedCalories(target: number, meals: MealSummary[]): Map<Meal, number> {
  const left = target - totalOf(meals.map((meal) => meal.totals)).calories;
  const empty = MEALS.filter(({ meal }) => meals.some((m) => m.meal === meal && m.items === 0));
  const shares = empty.reduce((sum, { share }) => sum + share, 0);
  const suggested = new Map<Meal, number>();
  if (left <= 0 || shares === 0) {
    return suggested;
  }
  for (const { meal, share } of empty) {
    suggested.set(meal, Math.round((left * share) / shares / 10) * 10);
  }
  return suggested;
}

/** The signed-in user's entries of a day, YYYY-MM-DD, in the order they were logged. */
export function useDayEntries(day: string) {
  return useQuery({
    queryKey: ['meal-entries', day],
    queryFn: async (): Promise<MealEntry[]> => {
      const { data, error } = await supabase
        .from('meal_entries')
        .select('meal, kcal, protein_g, carbs_g, fat_g')
        .eq('day', day)
        .order('id');
      if (error) {
        throw error;
      }
      // Generated columns are typed as nullable, though the database always fills them.
      return data.map((row) => ({
        meal: row.meal,
        calories: row.kcal ?? 0,
        proteinG: row.protein_g ?? 0,
        carbsG: row.carbs_g ?? 0,
        fatG: row.fat_g ?? 0,
      }));
    },
  });
}
