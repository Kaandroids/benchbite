import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { openNutritionDay } from '@/nutrition/open-nutrition-day';

import type { StreakBreak } from './streak';

/**
 * When the break of the streak asks to be answered. Closed, a break waits until it changes, as
 * when another day is missed; while one of its days is being logged, until the tab shows again.
 * After it is answered, the message saying how it went shows instead.
 */
export function useBreakPrompt(streakBreak: StreakBreak | null) {
  const [closed, setClosed] = useState<string | null>(null);
  const [away, setAway] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useFocusEffect(useCallback(() => setAway(false), []));
  const key = streakBreak?.days.map(({ day }) => day).join() ?? null;

  return {
    /** Whether the break shows, once nothing else is in the way. */
    open: key !== null && key !== closed && !away,
    close: () => setClosed(key),
    /** Opens a missed day on the Nutrition tab to log it. */
    log: (day: string) => {
      setAway(true);
      openNutritionDay(day);
    },
    message,
    setMessage,
    hideMessage: useCallback(() => setMessage(null), []),
  };
}
