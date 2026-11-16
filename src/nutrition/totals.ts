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
