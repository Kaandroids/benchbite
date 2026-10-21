// Rules for the body data steps. They only decide what the onboarding shows and allows; the
// calorie targets themselves are calculated in the database (ADR 0009).
import type { OnboardingAnswers } from './types';

/** Benchbite is for adults (#48). */
export const MIN_AGE = 18;
/** The lower end of a healthy body mass index. Targets below it are not allowed. */
export const MIN_HEALTHY_BMI = 18.5;

/** Weights and heights the database accepts. */
export const WEIGHT_RANGE_KG = { min: 30, max: 300 };
export const HEIGHT_RANGE_CM = { min: 100, max: 250 };

/** The age reached this year, as the database calculates it. */
export function ageIn(year: number, birthYear: number): number {
  return year - birthYear;
}

export function bmi(weightKg: number, heightCm: number): number {
  return weightKg / (heightCm / 100) ** 2;
}

/** The lowest weight with a healthy BMI for the height, rounded up to a tenth of a kilogram. */
export function minHealthyWeightKg(heightCm: number): number {
  return Math.ceil(MIN_HEALTHY_BMI * (heightCm / 100) ** 2 * 10) / 10;
}

type Goal = NonNullable<OnboardingAnswers['goal']>;

/** Whether the target lies in the goal's direction: below for losing fat, above for muscle. */
export function isTargetInGoalDirection(goal: Goal, weightKg: number, targetKg: number): boolean {
  return goal === 'lose_fat' ? targetKg < weightKg : targetKg > weightKg;
}

type PaceRange = { min: number; max: number; step: number; default: number };

/**
 * The weekly paces the slider offers, in the user's unit. The fastest pace matches what the
 * calorie targets allow: a deficit of at most 1000 kcal a day, about 0.9 kilograms or two pounds
 * a week, and a surplus of at most 500 kcal, about 0.45 kilograms or one pound. Popular apps such
 * as MyFitnessPal stop at two pounds a week too.
 */
export const PACE_RANGES: Record<'kg' | 'lb', Record<'lose_fat' | 'build_muscle', PaceRange>> = {
  kg: {
    lose_fat: { min: 0.25, max: 0.9, step: 0.05, default: 0.5 },
    build_muscle: { min: 0.1, max: 0.45, step: 0.05, default: 0.25 },
  },
  lb: {
    lose_fat: { min: 0.5, max: 2, step: 0.1, default: 1 },
    build_muscle: { min: 0.25, max: 1, step: 0.05, default: 0.5 },
  },
};

export type PaceLevel = 'ideal' | 'ambitious' | 'aggressive';

/**
 * How demanding a weekly pace is, as a share of body weight (Helms et al., 2014): losing up to
 * 1 % a week keeps muscle, up to 1.5 % is doable; gaining more than 0.5 % a week adds mostly fat.
 */
export function paceLevel(goal: Goal, weightKg: number, weeklyPaceKg: number): PaceLevel {
  const percent = (weeklyPaceKg / weightKg) * 100;
  const [ideal, ambitious] = goal === 'lose_fat' ? [1, 1.5] : [0.5, 1];
  return percent <= ideal ? 'ideal' : percent <= ambitious ? 'ambitious' : 'aggressive';
}

/** The day the target weight is reached at a steady weekly pace. */
export function projectedDate(
  weightKg: number,
  targetKg: number,
  weeklyPaceKg: number,
  from: Date,
): Date {
  const weeks = Math.abs(targetKg - weightKg) / weeklyPaceKg;
  const date = new Date(from);
  date.setDate(date.getDate() + Math.ceil(weeks * 7));
  return date;
}
