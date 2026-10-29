import { parseDecimal } from '@/lib/math';

import { KCAL_PER_GRAM, type NutritionTargets } from './targets';

// The limits of the own_nutrition_targets table (migration 20261028180000), checked here first so
// that Save stays off for targets the database would refuse.
const CALORIES = { min: 800, max: 6000 };
const MAX_GRAMS = { proteinG: 500, carbsG: 1000, fatG: 400 } as const;

/** Targets as typed, one field each. */
export type TargetsForm = { calories: string; protein: string; carbs: string; fat: string };

/** The form for some targets, such as the calculated ones to start from. */
export function targetsFormOf(targets: NutritionTargets): TargetsForm {
  return {
    calories: String(targets.calories),
    protein: String(targets.proteinG),
    carbs: String(targets.carbsG),
    fat: String(targets.fatG),
  };
}

/** What protein, carbs and fat make in kcal, at 4, 4 and 9 kcal per gram. */
export function macroCalories({ proteinG, carbsG, fatG }: Omit<NutritionTargets, 'calories'>) {
  return (
    KCAL_PER_GRAM.proteinG * proteinG + KCAL_PER_GRAM.carbsG * carbsG + KCAL_PER_GRAM.fatG * fatG
  );
}

export type TargetsResult =
  | { kind: 'valid'; targets: NutritionTargets; macroCalories: number }
  /** A field is empty, not a whole number or out of its limits. */
  | { kind: 'incomplete' }
  /** The macros make more kcal than the calories, beyond 5 % or 50 kcal of rounding. */
  | { kind: 'tooMuchMacros'; macroCalories: number; calories: number };

/** The targets typed, checked as the database checks them. */
export function readTargetsForm(form: TargetsForm): TargetsResult {
  const whole = (text: string) => {
    const value = parseDecimal(text);
    return value !== null && Number.isInteger(value) ? value : null;
  };
  const calories = whole(form.calories);
  const proteinG = whole(form.protein);
  const carbsG = whole(form.carbs);
  const fatG = whole(form.fat);
  if (
    calories === null ||
    proteinG === null ||
    carbsG === null ||
    fatG === null ||
    calories < CALORIES.min ||
    calories > CALORIES.max ||
    proteinG > MAX_GRAMS.proteinG ||
    carbsG > MAX_GRAMS.carbsG ||
    fatG > MAX_GRAMS.fatG ||
    Math.min(proteinG, carbsG, fatG) < 0
  ) {
    return { kind: 'incomplete' };
  }
  const fromMacros = macroCalories({ proteinG, carbsG, fatG });
  if (fromMacros - calories > Math.max(50, 0.05 * calories)) {
    return { kind: 'tooMuchMacros', macroCalories: fromMacros, calories };
  }
  return {
    kind: 'valid',
    targets: { calories, proteinG, carbsG, fatG },
    macroCalories: fromMacros,
  };
}
