// Where a body goal stops being healthy, shared with the app, which shows the same limits when a
// goal is set, so that Bite judges a goal as the app does (ADR 0053).
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
  const percent = (weeklyPaceKg / weightKg) * 100;
  const [ideal, ambitious] = PACE_LEVELS[losing ? 'losing' : 'gaining'];
  return percent <= ideal ? 'ideal' : percent <= ambitious ? 'ambitious' : 'aggressive';
}
