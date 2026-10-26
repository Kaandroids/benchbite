// Rules for the body data steps. They only decide what the onboarding shows and allows; the
// calorie targets themselves are calculated in the database (ADR 0009).
import { toTenth } from '@/i18n/units';
import { clamp } from '@/lib/math';

import type { Goal, OnboardingAnswers } from './types';

/** Benchbite is for adults (#48). */
export const MIN_AGE = 18;
/** The lower end of a healthy body mass index. Targets below it are not allowed. */
export const MIN_HEALTHY_BMI = 18.5;

/** Heights the database accepts. */
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

/** Whether the target lies in the goal's direction: below for losing fat, above for muscle. */
export function isTargetInGoalDirection(goal: Goal, weightKg: number, targetKg: number): boolean {
  // Compared as the database stores them, so that two weights a few hundredths apart, as from
  // pounds, are not saved as the same.
  const weight = toTenth(weightKg);
  const target = toTenth(targetKg);
  return goal === 'lose_fat' ? target < weight : target > weight;
}

type PaceRange = { min: number; max: number; step: number; default: number };

/**
 * A pace on the slider's steps and within its range. A pace in pounds comes back from kilograms
 * a hundredth off, such as 1 lb as 0.45 kg and then 0.99 lb, which no step of the slider is.
 */
export function snapPace(value: number, range: PaceRange): number {
  const steps = Math.round((value - range.min) / range.step);
  const snapped = Math.round((range.min + steps * range.step) * 100) / 100;
  return clamp(snapped, range.min, range.max);
}

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

/**
 * The weight the user aims for and the weekly pace, for a goal that changes the weight, or null
 * for one that keeps it.
 */
export function weightGoal(
  answers: OnboardingAnswers,
): { goal: 'lose_fat' | 'build_muscle'; targetKg: number; paceKg: number } | null {
  const { goal, targetWeightKg, weeklyPaceKg } = answers;
  if ((goal !== 'lose_fat' && goal !== 'build_muscle') || !targetWeightKg || !weeklyPaceKg) {
    return null;
  }
  return { goal, targetKg: targetWeightKg, paceKg: weeklyPaceKg };
}

/**
 * How much each level of daily movement multiplies the calories burnt at rest. They mirror
 * `activity_factors` in calculate_nutrition_targets(), which nutrition_targets.test.sql pins to
 * the same values; change both.
 */
export const ACTIVITY_FACTORS: Record<NonNullable<OnboardingAnswers['activityLevel']>, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

/** How many more calories a level of daily movement burns than mostly sitting, as a share. */
export function activityShare(level: NonNullable<OnboardingAnswers['activityLevel']>): number {
  return ACTIVITY_FACTORS[level] / ACTIVITY_FACTORS.sedentary - 1;
}
