import { useSyncExternalStore } from 'react';

import { toIsoDate } from '@/i18n/dates';

import { NO_STREAK, type DayStatus, type Streak } from './streak';

// Streaks are not recorded yet (#70). In development, the component gallery can show a sample
// on the Today tab instead.
let sample: Streak | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in user's streak. */
export function useStreak(): Streak {
  return useSyncExternalStore(subscribe, () => sample) ?? NO_STREAK;
}

/** Shows a sample streak instead of the user's, or the user's again with null. */
export function showSampleStreak(streak: Streak | null) {
  sample = streak;
  for (const listener of listeners) {
    listener();
  }
}

/** Days before today, from the earliest to yesterday. */
const SAMPLE_DAYS: DayStatus[] = ['done', 'done', 'frozen', 'done'];

/** A streak of a few days up to yesterday, one of them frozen, for trying out the screens. */
export function sampleStreak(today: Date, doneToday: boolean): Streak {
  const days = Object.fromEntries(
    SAMPLE_DAYS.map((status, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - SAMPLE_DAYS.length + index);
      return [toIsoDate(date), status];
    }),
  );
  return { count: SAMPLE_DAYS.length + (doneToday ? 1 : 0), doneToday, days };
}
