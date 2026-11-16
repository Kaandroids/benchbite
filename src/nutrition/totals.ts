import type { NutritionTargets } from './targets';

/** What a meal or a day adds up to, in the units of the targets. */
export type Totals = NutritionTargets;

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
