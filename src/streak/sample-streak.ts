// A made-up streak for the component gallery, which can show it on the Today tab while streaks are
// not recorded yet (#70). Only the gallery uses it.
import { toIsoDate } from '@/i18n/dates';

import type { DayStatus, Streak } from './streak';

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
