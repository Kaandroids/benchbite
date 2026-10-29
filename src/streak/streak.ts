/** How a past day counted for the streak; a day without a status broke it or is still open. */
export type DayStatus = 'done' | 'frozen';

export type Streak = {
  /** Days in a row, today included once it is done. */
  count: number;
  doneToday: boolean;
  /** The status of each counted day of this week, by its date as YYYY-MM-DD. */
  days: Record<string, DayStatus>;
};

/**
 * Missed days whose break the user has not answered yet (ADR 0042): they can freeze them, one
 * freeze a day, when they have enough, or start again.
 */
export type StreakBreak = {
  /** The missed days, as YYYY-MM-DD, from the earliest. */
  missed: string[];
  freezes: number;
  /** The streak if the missed days were frozen. */
  savedCount: number;
};

/** The streak until it loads, and of a user without one. */
export const NO_STREAK: Streak = { count: 0, doneToday: false, days: {} };

export const STREAK_KEY = ['streak'];
