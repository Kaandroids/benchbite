import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { scaled, totalOf } from './meals';
import type { NutritionTargets } from './targets';

/** What was eaten on a day, and the targets it is measured against (day_nutrition()). */
export type DayNutrition = {
  /** YYYY-MM-DD. */
  day: string;
  eaten: NutritionTargets;
  entries: number;
  /** Null for a user without targets. */
  targets: NutritionTargets | null;
  /** Whether its calories kept its target, as the streak counts them (ADR 0044). */
  keptTarget: boolean;
};

/** What was eaten in a span of days on the days logged, against their targets. */
export type NutritionSummary = {
  /** The days with entries. */
  days: number;
  /** The days logged whose calories kept their target, as the streak counts them (ADR 0044). */
  withinTarget: number;
  eaten: NutritionTargets;
  /** What was eaten on an average day logged. */
  average: NutritionTargets;
  /** The targets of the days logged, added up; null when none of them has targets. */
  targets: NutritionTargets | null;
  /** The targets of an average day logged that has them; null when none has. */
  averageTargets: NutritionTargets | null;
};

/**
 * Days added up: only the days logged count, so that a day without entries does not count as
 * eaten nothing (ADR 0046). Null when no day was logged.
 */
export function nutritionSummary(days: readonly DayNutrition[]): NutritionSummary | null {
  const logged = days.filter((day) => day.entries > 0);
  if (logged.length === 0) {
    return null;
  }
  const eaten = totalOf(logged.map((day) => day.eaten));
  const withTargets = logged.flatMap((day) => (day.targets ? [day.targets] : []));
  const targets = withTargets.length > 0 ? totalOf(withTargets) : null;
  return {
    days: logged.length,
    withinTarget: logged.filter((day) => day.keptTarget).length,
    eaten,
    average: scaled(eaten, 1 / logged.length),
    targets,
    averageTargets: targets && scaled(targets, 1 / withTargets.length),
  };
}

/** Whether a day's calories went over its target. */
export function isOverTarget(day: DayNutrition): boolean {
  return day.targets !== null && day.eaten.calories > day.targets.calories;
}

/** The query keys of what was eaten on spans of days, which changing an entry reloads. */
export const NUTRITION_DAYS_KEY = ['meal-entries', 'days'];

/**
 * What was eaten on each day from `from` to `to`, at most a year, with the targets each day kept,
 * as seen on the device's `today` (ADR 0046); not loaded until `enabled`. A chart whose range
 * changes keeps the last days until the new ones load.
 */
export function useDayNutrition(
  today: Date,
  from: Date,
  to: Date,
  { enabled = true, keepLast = false }: { enabled?: boolean; keepLast?: boolean } = {},
) {
  const fromDay = toIsoDate(from);
  const toDay = toIsoDate(to);
  return useQuery({
    queryKey: [...NUTRITION_DAYS_KEY, fromDay, toDay],
    enabled,
    placeholderData: keepLast ? keepPreviousData : undefined,
    queryFn: async (): Promise<DayNutrition[]> => {
      const { data, error } = await supabase.rpc('day_nutrition', {
        from_day: fromDay,
        to_day: toDay,
        today: toIsoDate(today),
      });
      if (error) {
        throw error;
      }
      return data.map(dayNutritionOf);
    },
  });
}

type DayNutritionRow = Database['public']['Functions']['day_nutrition']['Returns'][number];

function dayNutritionOf(row: DayNutritionRow): DayNutrition {
  return {
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
    keptTarget: row.kept_target,
  };
}

/**
 * What was eaten on each day of the week of `week`, with the targets each day kept, as seen on the
 * device's `today` (ADR 0046); not loaded until `enabled`.
 */
export function useWeekNutrition(today: Date, week: Date, enabled = true) {
  const monday = weekStart(week);
  return useDayNutrition(today, monday, addDays(monday, 6), { enabled });
}
