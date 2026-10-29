import { supabase } from '@/lib/supabase';
import { addDays, toIsoDate, weekStart } from '@/i18n/dates';

/** How a past day counted for the streak; a day without a status broke it or is still open. */
export type DayStatus = 'done' | 'frozen';

export type Streak = {
  /** Days in a row, today included once it is done. */
  count: number;
  doneToday: boolean;
  /** The status of each counted day of this week, by its date as YYYY-MM-DD. */
  days: Record<string, DayStatus>;
};

/** The streak until it loads, and of a user without one. */
export const NO_STREAK: Streak = { count: 0, doneToday: false, days: {} };

export const STREAK_KEY = ['streak'];

/**
 * The signed-in user's streak on the device's `today` (streak(), ADR 0042), with how each day of
 * this week went (streak_states()).
 */
export async function fetchStreak(today: Date): Promise<Streak> {
  const todayOn = toIsoDate(today);
  const [streak, states] = await Promise.all([
    supabase.rpc('streak', { today: todayOn }).single(),
    supabase.rpc('streak_states', {
      from_day: toIsoDate(weekStart(today)),
      to_day: toIsoDate(addDays(weekStart(today), 6)),
      today: todayOn,
    }),
  ]);
  if (streak.error) {
    throw streak.error;
  }
  if (states.error) {
    throw states.error;
  }
  const days: Record<string, DayStatus> = {};
  for (const { day, state } of states.data) {
    if (state === 'done' || state === 'frozen') {
      days[day] = state;
    }
  }
  return { count: streak.data.count, doneToday: streak.data.counted_today, days };
}
