// Rules for body data, goals and paces. They only decide what the onboarding and changing the
// goal show and allow; the calorie targets themselves are calculated in the database (ADR 0009).
import {
  isPaceHeldUp,
  MIN_HEALTHY_BMI,
  paceLevel as levelOf,
  type PaceLevel,
} from '@shared/body/limits';

import { paceIn, paceToKg, toTenth, type WeightUnit } from '@/i18n/units';
import type { Database } from '@/lib/database.types';
import { clamp } from '@/lib/math';

/** What the user wants to achieve, which shapes both the training and the calories. */
export type Goal = Database['public']['Enums']['goal_kind'];
/** How active the user is outside workouts. */
export type ActivityLevel = Database['public']['Enums']['activity_level'];
/** A goal that changes the weight, and so has a target weight and a pace. */
export type WeightGoal = 'lose_fat' | 'build_muscle';

/** Whether a goal changes the weight, and so asks for a target weight and a pace. */
export function changesWeight(goal: Goal | undefined): goal is WeightGoal {
  return goal === 'lose_fat' || goal === 'build_muscle';
}

/** Benchbite is for adults (#48). */
export const MIN_AGE = 18;
// The lower end of a healthy body mass index, below which targets are not allowed, how a pace is
// judged, when a goal is reached and when the floor holds its pace up: shared with Bite (ADR 0053,
// ADR 0054).
export {
  bmi,
  isPaceHeldUp,
  isTargetReached,
  MIN_HEALTHY_BMI,
  type PaceLevel,
} from '@shared/body/limits';

/** Heights the database accepts. */
export const HEIGHT_RANGE_CM = { min: 100, max: 250 };

/** The age reached this year, as the database calculates it. */
export function ageIn(year: number, birthYear: number): number {
  return year - birthYear;
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

/** Whether the weight is already at the lower end of a healthy one, so that losing fat is not. */
export function isTooLightToLose(weightKg: number, heightCm: number): boolean {
  return weightKg <= minHealthyWeightKg(heightCm);
}

/** Why a target weight cannot be saved. */
export type TargetWeightProblem = 'wrongDirection' | 'tooClose' | 'belowHealthy';

/**
 * What keeps a target weight from being saved, or null when it can be: it has to lie in the goal's
 * direction, as stored, and, when losing fat, not below a healthy weight for the height.
 */
export function targetWeightProblem(
  goal: WeightGoal,
  weightKg: number,
  targetKg: number,
  heightCm: number,
): TargetWeightProblem | null {
  if (!isTargetInGoalDirection(goal, weightKg, targetKg)) {
    // In the goal's direction as shown, but stored as the current weight, as from pounds.
    const shownInDirection = goal === 'lose_fat' ? targetKg < weightKg : targetKg > weightKg;
    return shownInDirection ? 'tooClose' : 'wrongDirection';
  }
  if (goal === 'lose_fat' && targetKg < minHealthyWeightKg(heightCm)) {
    return 'belowHealthy';
  }
  return null;
}

/** How far from the current weight a target starts. */
const DEFAULT_CHANGE_KG = { lose_fat: -5, build_muscle: 3 };

/** The target weight to start from: a few kilograms in the goal's direction, but healthy. */
export function defaultTargetKg(goal: WeightGoal, weightKg: number, heightCm: number): number {
  return Math.max(minHealthyWeightKg(heightCm), weightKg + DEFAULT_CHANGE_KG[goal]);
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
export const PACE_RANGES: Record<'kg' | 'lb', Record<WeightGoal, PaceRange>> = {
  kg: {
    lose_fat: { min: 0.25, max: 0.9, step: 0.05, default: 0.5 },
    build_muscle: { min: 0.1, max: 0.45, step: 0.05, default: 0.25 },
  },
  lb: {
    lose_fat: { min: 0.5, max: 2, step: 0.1, default: 1 },
    build_muscle: { min: 0.25, max: 1, step: 0.05, default: 0.5 },
  },
};

/**
 * The paces the slider offers the user, in the unit: losing stops a step before the app would
 * call the pace aggressive for their weight (#332, ADR 0054), once saved in kilograms, where that
 * comes before the fastest the targets allow; `byWeight` when it does.
 */
export function paceRange(
  unit: WeightUnit,
  goal: WeightGoal,
  weightKg: number,
): PaceRange & { byWeight: boolean } {
  const range = PACE_RANGES[unit][goal];
  let max = range.max;
  // A weight not known yet stops nothing.
  while (
    goal === 'lose_fat' &&
    weightKg > 0 &&
    max > range.min &&
    levelOf(true, weightKg, paceToKg(unit, max)) === 'aggressive'
  ) {
    max = Math.round((max - range.step) * 100) / 100;
  }
  return { ...range, max, default: Math.min(range.default, max), byWeight: max < range.max };
}

/**
 * The pace the slider starts at, in the unit: the saved one on the slider's steps, as one saved
 * before the limits changed may lie outside them, or the default.
 */
export function startingPace(
  unit: WeightUnit,
  goal: WeightGoal,
  weightKg: number,
  savedKg: number | null | undefined,
): number {
  const range = paceRange(unit, goal, weightKg);
  return savedKg == null ? range.default : snapPace(paceIn(unit, savedKg), range);
}

/** Whether a pace in kilograms lies within what the slider offers the user in the unit. */
export function isPaceInRange(
  unit: WeightUnit,
  goal: WeightGoal,
  weightKg: number,
  paceKg: number,
): boolean {
  const range = paceRange(unit, goal, weightKg);
  const pace = paceIn(unit, paceKg);
  // A hundredth either way, as a pace comes back from the other unit rounded.
  return pace >= range.min - 0.01 && pace <= range.max + 0.01;
}

/**
 * How a goal is reached: at the chosen pace, at the slower one the floor holds the targets to
 * (ADR 0054), or not at all, when they keep the weight; with when it is reached.
 */
export type GoalPace =
  | { kind: 'chosen' | 'heldUp'; paceKg: number; date: Date }
  | { kind: 'none'; paceKg: 0; date: null };

export function goalPace(
  weightKg: number,
  targetKg: number,
  chosenKg: number,
  achievableKg: number | null | undefined,
  from: Date,
): GoalPace {
  if (!isPaceHeldUp(chosenKg, achievableKg)) {
    return {
      kind: 'chosen',
      paceKg: chosenKg,
      date: projectedDate(weightKg, targetKg, chosenKg, from),
    };
  }
  if (achievableKg <= 0) {
    return { kind: 'none', paceKg: 0, date: null };
  }
  return {
    kind: 'heldUp',
    paceKg: achievableKg,
    date: projectedDate(weightKg, targetKg, achievableKg, from),
  };
}

/** How demanding a weekly pace is for the goal, as a share of body weight. */
export function paceLevel(goal: Goal, weightKg: number, weeklyPaceKg: number): PaceLevel {
  return levelOf(goal === 'lose_fat', weightKg, weeklyPaceKg);
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
export function weightGoal(answers: {
  goal?: Goal;
  targetWeightKg?: number;
  weeklyPaceKg?: number;
  /** The pace the targets really give (ADR 0054), when it is known. */
  achievablePaceKg?: number | null;
}): {
  goal: WeightGoal;
  targetKg: number;
  paceKg: number;
  achievablePaceKg?: number | null;
} | null {
  const { goal, targetWeightKg, weeklyPaceKg, achievablePaceKg } = answers;
  if (!changesWeight(goal) || !targetWeightKg || !weeklyPaceKg) {
    return null;
  }
  return { goal, targetKg: targetWeightKg, paceKg: weeklyPaceKg, achievablePaceKg };
}

/**
 * How much each level of daily movement multiplies the calories burnt at rest. They mirror
 * `activity_factors` in calculate_nutrition_targets(), which nutrition_targets.test.sql pins to
 * the same values; change both.
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

/** How many more calories a level of daily movement burns than mostly sitting, as a share. */
export function activityShare(level: ActivityLevel): number {
  return ACTIVITY_FACTORS[level] / ACTIVITY_FACTORS.sedentary - 1;
}
