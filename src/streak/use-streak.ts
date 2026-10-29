import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { toIsoDate } from '@/i18n/dates';

import { fetchStreak, NO_STREAK, STREAK_KEY, type Streak } from './streak';

// In development, the component gallery can show a sample on the Today tab instead.
let sample: Streak | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in user's streak on `today`, none until it loads. */
export function useStreak(today: Date): Streak {
  const shown = useSyncExternalStore(subscribe, () => sample);
  const streak = useQuery({
    queryKey: [...STREAK_KEY, toIsoDate(today)],
    queryFn: () => fetchStreak(today),
  });
  return shown ?? streak.data ?? NO_STREAK;
}

/** Shows a sample streak instead of the user's, or the user's again with null. */
export function showSampleStreak(streak: Streak | null) {
  sample = streak;
  for (const listener of listeners) {
    listener();
  }
}
