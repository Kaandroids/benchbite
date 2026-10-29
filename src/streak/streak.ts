import type { Workout } from '@/workouts/workouts';

/** How a past day counted for the streak; a day without a status broke it or is still open. */
export type DayStatus = 'done' | 'frozen';

export type Streak = {
  /** Days in a row, today included once it is done. */
  count: number;
  doneToday: boolean;
  /** The status of each counted day of this week, by its date as YYYY-MM-DD. */
  days: Record<string, DayStatus>;
};

/** What kept a missed day from counting (streak_break_days(), #278). */
export type MissedDay = {
  /** YYYY-MM-DD. */
  day: string;
  /** Its workouts not done, or skipped. */
  workouts: (Pick<Workout, 'name' | 'type'> & { id: number; skipped: boolean })[];
  eaten: number;
  target: number;
  /** Whether the calories eaten kept the day: more than none and no more than the target. */
  caloriesCount: boolean;
};

/**
 * Missed days whose break the user has not answered yet (ADR 0042): they can freeze them, one
 * freeze a day, when they have enough, or start again.
 */
export type StreakBreak = {
  /** The missed days and why each did not count, from the earliest. */
  days: MissedDay[];
  freezes: number;
  /** The streak if the missed days were frozen. */
  savedCount: number;
};

/** The streak until it loads, and of a user without one. */
export const NO_STREAK: Streak = { count: 0, doneToday: false, days: {} };

export const STREAK_KEY = ['streak'];
