import { useQuery } from '@tanstack/react-query';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import type { NutritionTargets } from './targets';

/** What was eaten on a day, and the targets it is measured against (day_nutrition()). */
export type DayNutrition = {
  /** YYYY-MM-DD. */
  day: string;
  eaten: NutritionTargets;
  entries: number;
  /** Null for a user without targets. */
  targets: NutritionTargets | null;
};

/** What was eaten in a week on the days logged, against their targets. */
export type WeekNutrition = {
  /** The days with entries. */
  days: number;
  eaten: NutritionTargets;
  /** What was eaten on an average day logged. */
  average: NutritionTargets;
  /** The targets of the days logged, added up; null when none of them has targets. */
  targets: NutritionTargets | null;
};

const NONE: NutritionTargets = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

const add = (a: NutritionTargets, b: NutritionTargets): NutritionTargets => ({
  calories: a.calories + b.calories,
  proteinG: a.proteinG + b.proteinG,
  carbsG: a.carbsG + b.carbsG,
  fatG: a.fatG + b.fatG,
});

/**
 * The week's days added up: only the days logged count, so that a day without entries does not
 * count as eaten nothing (ADR 0046). Null when no day was logged.
 */
export function weekNutrition(days: readonly DayNutrition[]): WeekNutrition | null {
  const logged = days.filter((day) => day.entries > 0);
  if (logged.length === 0) {
    return null;
  }
  const eaten = logged.reduce((sum, day) => add(sum, day.eaten), NONE);
  const withTargets = logged.flatMap((day) => (day.targets ? [day.targets] : []));
  return {
    days: logged.length,
    eaten,
    average: {
      calories: eaten.calories / logged.length,
      proteinG: eaten.proteinG / logged.length,
      carbsG: eaten.carbsG / logged.length,
      fatG: eaten.fatG / logged.length,
    },
    targets: withTargets.length > 0 ? withTargets.reduce(add, NONE) : null,
  };
}

/** Whether a day's calories went over its target. */
export function isOverTarget(day: DayNutrition): boolean {
  return day.targets !== null && day.eaten.calories > day.targets.calories;
}

/** The query keys of what was eaten in each week, which changing an entry reloads. */
export const WEEK_NUTRITION_KEY = ['meal-entries', 'week'];

/**
 * What was eaten on each day of the week of `week`, with the targets each day kept, as seen on the
 * device's `today` (ADR 0046).
 */
export function useWeekNutrition(today: Date, week: Date) {
  const monday = weekStart(week);
  return useQuery({
    queryKey: [...WEEK_NUTRITION_KEY, toIsoDate(monday)],
    queryFn: async (): Promise<DayNutrition[]> => {
      const { data, error } = await supabase.rpc('day_nutrition', {
        from_day: toIsoDate(monday),
        to_day: toIsoDate(addDays(monday, 6)),
        today: toIsoDate(today),
      });
      if (error) {
        throw error;
      }
      return data.map((row) => ({
        day: row.day,
        eaten: {
          calories: row.kcal,
          proteinG: row.protein_g,
          carbsG: row.carbs_g,
          fatG: row.fat_g,
        },
        entries: row.entries,
        // The generated types do not know that the targets are null for a user without them.
        targets:
          (row.target_calories as number | null) === null
            ? null
            : {
                calories: row.target_calories,
                proteinG: row.target_protein_g,
                carbsG: row.target_carbs_g,
                fatG: row.target_fat_g,
              },
      }));
    },
  });
}
