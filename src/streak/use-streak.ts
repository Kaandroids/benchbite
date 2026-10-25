import { useSyncExternalStore } from 'react';

import { NO_STREAK, type Streak } from './streak';

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
