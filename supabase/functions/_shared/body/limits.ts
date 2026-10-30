// Where a body goal stops being healthy, when it is reached and when its pace is held up, shared
// with the app, which shows the same limits when a goal is set, so that Bite judges a goal as the
// app does (ADR 0053, ADR 0054).
// This file imports nothing, so that the app can bundle it.

/** The lower end of a healthy body mass index. */
export const MIN_HEALTHY_BMI = 18.5;

export function bmi(weightKg: number, heightCm: number): number {
  return weightKg / (heightCm / 100) ** 2;
}

export type PaceLevel = 'ideal' | 'ambitious' | 'aggressive';

/**
 * The weekly change, as a share of body weight in percent, up to which a pace is ideal and then
 * ambitious (Helms et al., 2014): losing up to 1 % a week keeps muscle, up to 1.5 % is doable;
 * gaining more than 0.5 % a week adds mostly fat.
 */
export const PACE_LEVELS = { losing: [1, 1.5], gaining: [0.5, 1] } as const;

/** How demanding a weekly pace is for the user's weight, losing or gaining. */
export function paceLevel(losing: boolean, weightKg: number, weeklyPaceKg: number): PaceLevel {
  // To a hundredth of a percent, so that a pace of exactly 1.5 % is not judged over it.
  const percent = Math.round((weeklyPaceKg / weightKg) * 10000) / 100;
  const [ideal, ambitious] = PACE_LEVELS[losing ? 'losing' : 'gaining'];
  return percent <= ideal ? 'ideal' : percent <= ambitious ? 'ambitious' : 'aggressive';
}

/**
 * Whether the weight has reached the target of a goal that changes it: at or past it in the goal's
 * direction. The targets then keep the weight, as calculate_nutrition_targets() does.
 */
export function isTargetReached(goal: string, weightKg: number, targetKg: number): boolean {
  return (
    (goal === 'lose_fat' && weightKg <= targetKg) ||
    (goal === 'build_muscle' && weightKg >= targetKg)
  );
}

/**
 * Whether the targets give less than the chosen pace (ADR 0054), by more than rounding, as the
 * calorie floor or the cap on a day's deficit can hold them; `achievableKg` is what they give, 0
 * when they keep the weight, null when it is not known.
 */
export function isPaceHeldUp(
  chosenKg: number,
  achievableKg?: number | null,
): achievableKg is number {
  return achievableKg != null && achievableKg < chosenKg - 0.01;
}
