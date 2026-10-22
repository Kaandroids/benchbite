/** How a past day counted for the streak; a day without a status broke it or is still open. */
export type DayStatus = 'done' | 'frozen';

export type Streak = {
  /** Days in a row, today included once it is done. */
  count: number;
  doneToday: boolean;
  /** The status of each counted day, by its date as YYYY-MM-DD. */
  days: Record<string, DayStatus>;
};

/** Streaks are not recorded yet (#70); until they are, every user has none. */
export const NO_STREAK: Streak = { count: 0, doneToday: false, days: {} };
