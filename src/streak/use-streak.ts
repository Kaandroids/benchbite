import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import { NO_STREAK, STREAK_KEY, type DayStatus, type Streak } from './streak';

// In development, the component gallery can show a sample on the Today tab instead.
let sample: Streak | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The signed-in user's streak on the device's `today` (streak(), ADR 0042), with how each day of
 * this week went (streak_states()). It shows none until it loads; when loading again fails, it
 * keeps the last one, says it failed and can be tried again.
 */
export function useStreak(today: Date) {
  const shown = useSyncExternalStore(subscribe, () => sample);
  const todayOn = toIsoDate(today);
  const query = useQuery({
    queryKey: [...STREAK_KEY, todayOn],
    queryFn: async (): Promise<Streak> => {
      const monday = weekStart(today);
      const [streak, states] = await Promise.all([
        supabase.rpc('streak', { today: todayOn }).single(),
        supabase.rpc('streak_states', {
          from_day: toIsoDate(monday),
          to_day: toIsoDate(addDays(monday, 6)),
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
    },
  });
  // Read while rendering, so that a change of them renders again.
  return { streak: shown ?? query.data ?? NO_STREAK, failed: query.isError, retry: query.refetch };
}

/** Shows a sample streak instead of the user's, or the user's again with null. */
export function showSampleStreak(streak: Streak | null) {
  sample = streak;
  for (const listener of listeners) {
    listener();
  }
}
