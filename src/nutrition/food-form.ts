import { parseDecimal } from '@/lib/math';

import type { CustomFoodValues } from './custom-foods';
import type { Food, PortionUnit } from './foods';

// The limits of the custom_foods table (migration 20261027200000), checked here first so that
// Save stays off for a food the database would refuse.
export const MAX_NAME_LENGTH = 120;
const MAX_KCAL_PER_100G = 900;
const MAX_MACROS_PER_100G = 100;
const MAX_PORTION_GRAMS = 5000;

/** What the form holds as typed: values per 100 g, as labels print them, and one portion. */
export type FoodForm = {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  unit: PortionUnit | null;
  portionGrams: string;
};

export const EMPTY_FORM: FoodForm = {
  name: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
  unit: null,
  portionGrams: '',
};

/** The form for changing a food of one's own, with its values per 100 g. */
export function formOf(food: Food): FoodForm {
  const portion = food.portions[0] ?? null;
  return {
    name: food.name,
    kcal: String(food.per100g.calories),
    protein: String(food.per100g.proteinG),
    carbs: String(food.per100g.carbsG),
    fat: String(food.per100g.fatG),
    unit: portion?.unit ?? null,
    portionGrams: portion ? String(portion.grams) : '',
  };
}

/**
 * Why a filled-in form cannot be saved: values the database would refuse, or fewer calories than
 * the macros alone make, which means something was typed wrong.
 */
export type FormProblem = 'tooMuchEnergy' | 'tooMuchMacros' | 'portion' | 'tooFewCalories';

export type FormResult =
  | { kind: 'incomplete' }
  | { kind: 'problem'; problem: FormProblem }
  | { kind: 'valid'; values: CustomFoodValues };

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** The portion's grams, if a unit is chosen and they are a valid amount. */
function portionGramsOf(form: FoodForm): number | null {
  const grams = parseDecimal(form.portionGrams);
  if (!form.unit || grams === null) {
    return null;
  }
  const rounded = round(grams, 1);
  return rounded > 0 && rounded <= MAX_PORTION_GRAMS ? rounded : null;
}

/** The food the form describes, or what is missing or wrong. */
export function readForm(form: FoodForm): FormResult {
  // Macros left empty count as 0, as a label may list only some; the calories are needed.
  const numbers = [
    parseDecimal(form.kcal),
    ...[form.protein, form.carbs, form.fat].map((text) => (text.trim() ? parseDecimal(text) : 0)),
  ];
  if (!form.name.trim() || numbers.some((value) => value === null || value < 0)) {
    return { kind: 'incomplete' };
  }
  const portionGrams = portionGramsOf(form);
  if (form.unit && portionGrams === null) {
    return form.portionGrams.trim()
      ? { kind: 'problem', problem: 'portion' }
      : { kind: 'incomplete' };
  }
  // Rounded as the table keeps them before they are checked, as the table checks them.
  const [kcal, protein, carbs, fat] = numbers.map((value, index) =>
    round(value!, index === 0 ? 1 : 2),
  ) as [number, number, number, number];
  if (kcal > MAX_KCAL_PER_100G) {
    return { kind: 'problem', problem: 'tooMuchEnergy' };
  }
  // In hundredths, as the table adds them exactly and floats would not: 0.2 + 83.9 + 15.9 is
  // 100.00000000000001.
  if (Math.round((protein + carbs + fat) * 100) > MAX_MACROS_PER_100G * 100) {
    return { kind: 'problem', problem: 'tooMuchMacros' };
  }
  if (macroCheck(form)?.tooFewCalories) {
    return { kind: 'problem', problem: 'tooFewCalories' };
  }
  return {
    kind: 'valid',
    values: {
      name: form.name.trim(),
      per100g: { calories: kcal, proteinG: protein, carbsG: carbs, fatG: fat },
      portion: form.unit && portionGrams ? { unit: form.unit, grams: portionGrams } : null,
    },
  };
}

/**
 * The calories protein, carbs and fat alone make, 4 kcal per gram of protein and carbs and 9 per
 * gram of fat, and whether the calories typed are fewer than that. A food can have more, as
 * fibre, alcohol and sugar alcohols add energy too, but not fewer. Labels round, so it takes more
 * than 15 % or 10 kcal fewer, whichever is larger. Empty macros count as 0. Null until the
 * calories are typed.
 */
export function macroCheck(
  form: FoodForm,
): { calories: number; entered: number; tooFewCalories: boolean } | null {
  const kcal = parseDecimal(form.kcal);
  if (kcal === null || kcal < 0) {
    return null;
  }
  const [protein, carbs, fat] = [form.protein, form.carbs, form.fat].map(
    (text) => parseDecimal(text) ?? 0,
  ) as [number, number, number];
  const calories = 4 * protein + 4 * carbs + 9 * fat;
  return {
    calories,
    entered: kcal,
    tooFewCalories: calories - kcal > Math.max(10, calories * 0.15),
  };
}
