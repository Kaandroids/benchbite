import { useQuery } from '@tanstack/react-query';
import type { QueryData } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';

import { LOGGABLE_DAYS } from '@shared/meal/limits';

import type { IconName } from '@/components/ui/icon';
import type { Database } from '@/lib/database.types';
import { addDays, daysBetween, fromIsoDate, toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import { nameOf, pickedPortionOf, refOfRow, type Amount, type FoodRef } from './foods';

import type { NutritionTargets } from './targets';

export type Meal = Database['public']['Enums']['meal'];

/** What a meal or a day adds up to, in the units of the targets. */
export type Totals = NutritionTargets;

/** How many days before today meals can be logged, as the database allows. */
export { LOGGABLE_DAYS };

/** Whether a day, as YYYY-MM-DD, can still be logged on the device's `today`. */
export function canLog(day: string, today: Date): boolean {
  const back = daysBetween(fromIsoDate(day), today);
  return back >= 0 && back <= LOGGABLE_DAYS;
}

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

/** A logged entry: what it adds, and the food, amount and values it was logged with. */
export type LoggedEntry = MealEntry &
  Amount & {
    id: number;
    /** YYYY-MM-DD. */
    day: string;
    food: FoodRef;
    /** In the app language, falling back to English. */
    name: string;
    /** The food's values per 100 g when it was logged (ADR 0034). */
    per100g: Totals;
  };

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

/** Totals multiplied by a factor, such as a recipe's shared out by its servings. */
export function scaled(totals: Totals, factor: number): Totals {
  return {
    calories: totals.calories * factor,
    proteinG: totals.proteinG * factor,
    carbsG: totals.carbsG * factor,
    fatG: totals.fatG * factor,
  };
}

export type MealSummary = (typeof MEALS)[number] & { items: number; totals: Totals };

/** Every meal with its number of entries and what they add up to, empty ones too. */
export function mealsOf(entries: MealEntry[]): MealSummary[] {
  return MEALS.map((row) => {
    const items = entries.filter((entry) => entry.meal === row.meal);
    return { ...row, items: items.length, totals: totalOf(items) };
  });
}

/**
 * The calories suggested for each empty meal: what is left of the day, split between the empty
 * meals by their usual shares, to 10 kcal. Nothing is suggested once the day's calories are used
 * up, nor for a meal whose share rounds to nothing.
 */
export function suggestedCalories(target: number, meals: MealSummary[]): Map<Meal, number> {
  const left = target - totalOf(meals.map((meal) => meal.totals)).calories;
  const empty = meals.filter((meal) => meal.items === 0);
  const shares = empty.reduce((sum, { share }) => sum + share, 0);
  const suggested = new Map<Meal, number>();
  if (left <= 0 || shares === 0) {
    return suggested;
  }
  for (const { meal, share } of empty) {
    const calories = Math.round((left * share) / shares / 10) * 10;
    if (calories > 0) {
      suggested.set(meal, calories);
    }
  }
  return suggested;
}

/** A row's kcal and macros as totals; generated columns may be typed as nullable. */
export function totalsOf(row: {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}): Totals {
  return {
    calories: row.kcal ?? 0,
    proteinG: row.protein_g ?? 0,
    carbsG: row.carbs_g ?? 0,
    fatG: row.fat_g ?? 0,
  };
}

/** The query key of a day's entries, for anything that changes them. */
export const dayEntriesKey = (day: string) => ['meal-entries', day];

/** The columns of an entry that `loggedEntryOf` reads, with whether its food can still be logged. */
const ENTRY_COLUMNS =
  'id, day, meal, food_id, custom_food_id, recipe_id, grams, portion_unit, portion_count, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, kcal, protein_g, carbs_g, fat_g, foods(archived_at, food_names(language, name)), custom_foods(name, archived_at), recipes(name, archived_at)';

const entriesQuery = () => supabase.from('meal_entries').select(ENTRY_COLUMNS);

/** An entry as `ENTRY_COLUMNS` load it, typed from the generated database types. */
type EntryRow = QueryData<ReturnType<typeof entriesQuery>>[number];

/** An entry as `ENTRY_COLUMNS` load it, named in the language. */
function loggedEntryOf(row: EntryRow, language: string): LoggedEntry {
  return {
    id: row.id,
    day: row.day,
    meal: row.meal,
    food: refOfRow(row),
    name:
      row.recipes?.name ??
      row.custom_foods?.name ??
      nameOf(row.foods?.food_names ?? [], language, row.food_id ?? ''),
    grams: row.grams,
    portion: pickedPortionOf(row.portion_unit, row.portion_count),
    per100g: {
      calories: row.kcal_per_100g,
      proteinG: row.protein_per_100g,
      carbsG: row.carbs_per_100g,
      fatG: row.fat_per_100g,
    },
    ...totalsOf(row),
  };
}

/** The signed-in user's entries of a day, YYYY-MM-DD, in the order they were logged. */
export function useDayEntries(day: string) {
  const { i18n } = useTranslation();
  return useQuery({
    queryKey: [...dayEntriesKey(day), i18n.language],
    queryFn: async (): Promise<LoggedEntry[]> => {
      const { data, error } = await entriesQuery()
        .eq('day', day)
        // A restored entry keeps its time, so it returns to its place.
        .order('created_at')
        .order('id');
      if (error) {
        throw error;
      }
      return data.map((row) => loggedEntryOf(row, i18n.language));
    },
  });
}

/** The entries of a meal on the latest day before `day` that has it, up to a week back. */
export type PastMeal = { day: string; entries: LoggedEntry[] };

/**
 * The meal to add again on a day, as it was last eaten in the week before, or null. Entries of
 * foods that can no longer be logged are left out, as copying would leave them out.
 */
export function usePastMeal(day: string, meal: Meal) {
  const { i18n } = useTranslation();
  return useQuery({
    // Not under the day's key: it changes with the entries of the days before, which reload it.
    queryKey: ['past-meal', meal, day, i18n.language],
    queryFn: async (): Promise<PastMeal | null> => {
      const { data, error } = await entriesQuery()
        .eq('meal', meal)
        .lt('day', day)
        .gte('day', toIsoDate(addDays(fromIsoDate(day), -LOGGABLE_DAYS)))
        .order('day', { ascending: false })
        .order('created_at')
        .order('id');
      if (error) {
        throw error;
      }
      const loggable = data.filter(
        (row) =>
          (row.foods?.archived_at ??
            row.custom_foods?.archived_at ??
            row.recipes?.archived_at ??
            null) === null,
      );
      const latest = loggable[0]?.day;
      if (latest === undefined) {
        return null;
      }
      return {
        day: latest,
        entries: loggable
          .filter((row) => row.day === latest)
          .map((row) => loggedEntryOf(row, i18n.language)),
      };
    },
  });
}
