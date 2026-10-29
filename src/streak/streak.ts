import type { Database } from '@/lib/database.types';
import type { Workout } from '@/workouts/workouts';

/** How a past day counted for the streak; a day without a status broke it or is still open. */
export type DayStatus = 'done' | 'frozen';

/** How a day went for the streak (streak_states()): counted, frozen, missed, or today still open. */
export type DayState = Database['public']['Enums']['streak_state'];

/** A day that has a mark: counted, frozen or missed. */
export type MarkedState = Exclude<DayState, 'open'>;

/** The day's state when it has a mark, or undefined for a day open or without one. */
export function markedOf(state: DayState | undefined): MarkedState | undefined {
  return state && state !== 'open' ? state : undefined;
}

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

/**
 * The most days in a row that kept the streak among `days`, from the earliest: counted or frozen,
 * as streak() counts its days since the last one missed. A day still open neither adds nor breaks.
 */
export function longestRun(days: readonly DayState[]): number {
  let longest = 0;
  let run = 0;
  for (const state of days) {
    if (state === 'missed') {
      run = 0;
    } else if (state !== 'open') {
      run += 1;
      longest = Math.max(longest, run);
    }
  }
  return longest;
}
