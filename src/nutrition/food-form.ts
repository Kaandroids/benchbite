import { parseDecimal } from '@/lib/math';

import type { CustomFoodValues } from './custom-foods';
import type { Food, PortionUnit } from './foods';

/** What the form holds as typed: values per 100 g, or per portion as a label may print them. */
export type FoodForm = {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  basis: 'per100g' | 'perPortion';
  unit: PortionUnit | null;
  portionGrams: string;
};

export const EMPTY_FORM: FoodForm = {
  name: '',
  kcal: '',
  protein: '',
  carbs: '',
  fat: '',
  basis: 'per100g',
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
    basis: 'per100g',
    unit: portion?.unit ?? null,
    portionGrams: portion ? String(portion.grams) : '',
  };
}

/** Why a filled-in form cannot be saved, as the database would refuse it. */
export type FormProblem = 'tooMuchEnergy' | 'tooMuchMacros' | 'portion';

export type FormResult =
  | { kind: 'incomplete' }
  | { kind: 'problem'; problem: FormProblem }
  | { kind: 'valid'; values: CustomFoodValues };

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** The portion's grams, if a unit is chosen and they are a valid amount. */
function portionGramsOf(form: FoodForm): number | null {
  const grams = parseDecimal(form.portionGrams);
  return form.unit && grams !== null && grams > 0 && grams <= 5000 ? round(grams, 1) : null;
}

/**
 * The food the form describes, per 100 g, or what is missing or wrong. Values per portion are
 * scaled to 100 g by the portion's grams.
 */
export function readForm(form: FoodForm): FormResult {
  const numbers = [form.kcal, form.protein, form.carbs, form.fat].map(parseDecimal);
  if (!form.name.trim() || numbers.some((value) => value === null || value < 0)) {
    return { kind: 'incomplete' };
  }
  const portionGrams = portionGramsOf(form);
  if (form.unit && portionGrams === null) {
    return form.portionGrams.trim()
      ? { kind: 'problem', problem: 'portion' }
      : { kind: 'incomplete' };
  }
  const scale = form.basis === 'perPortion' && portionGrams ? 100 / portionGrams : 1;
  const [kcal, protein, carbs, fat] = numbers.map((value) => value! * scale) as [
    number,
    number,
    number,
    number,
  ];
  if (kcal > 900) {
    return { kind: 'problem', problem: 'tooMuchEnergy' };
  }
  if (protein + carbs + fat > 100) {
    return { kind: 'problem', problem: 'tooMuchMacros' };
  }
  return {
    kind: 'valid',
    values: {
      name: form.name.trim(),
      per100g: {
        calories: round(kcal, 1),
        proteinG: round(protein, 2),
        carbsG: round(carbs, 2),
        fatG: round(fat, 2),
      },
      portion: form.unit && portionGrams ? { unit: form.unit, grams: portionGrams } : null,
    },
  };
}

/**
 * The calories the macros add up to, 4 kcal per gram of protein and carbs and 9 per gram of fat,
 * and whether that is close to the calories typed. Labels round, and fibre and alcohol count
 * differently, so within 15 % or 10 kcal counts as close. Null until there is something to check.
 */
export function macroCheck(form: FoodForm): { calories: number; close: boolean } | null {
  const kcal = parseDecimal(form.kcal);
  const [protein, carbs, fat] = [form.protein, form.carbs, form.fat].map(
    (text) => parseDecimal(text) ?? 0,
  ) as [number, number, number];
  if (kcal === null || kcal <= 0 || protein + carbs + fat === 0) {
    return null;
  }
  const calories = 4 * protein + 4 * carbs + 9 * fat;
  return { calories, close: Math.abs(calories - kcal) <= Math.max(10, kcal * 0.15) };
}
