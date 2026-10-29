import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import {
  NO_STREAK,
  STREAK_KEY,
  type DayStatus,
  type MissedDay,
  type Streak,
  type StreakBreak,
} from './streak';

/** Why each missed day of a break did not count (streak_break_days()). */
async function fetchMissedDays(missed: string[], today: string): Promise<MissedDay[]> {
  const { data, error } = await supabase.rpc('streak_break_days', { days: missed, today });
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    day: row.day,
    workouts: row.workouts.map((workout) => ({
      id: workout.id as number,
      name: workout.name,
      type: workout.type,
      skipped: workout.skipped as boolean,
    })),
    eaten: row.eaten,
    target: row.target,
    caloriesCount: row.calories_count,
  }));
}

// In development, the component gallery can show a sample on the Today tab instead.
let sample: Streak | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The signed-in user's streak on the device's `today` (streak(), ADR 0042), with how each day of
 * this week went (streak_states()) and a break to answer. It shows none until it loads; when
 * loading again fails, it keeps the last one, says it failed and can be tried again.
 */
export function useStreak(today: Date) {
  const shown = useSyncExternalStore(subscribe, () => sample);
  const todayOn = toIsoDate(today);
  const query = useQuery({
    queryKey: [...STREAK_KEY, todayOn],
    queryFn: async (): Promise<{ streak: Streak; streakBreak: StreakBreak | null }> => {
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
      const { count, counted_today, freezes, missed, saved_count } = streak.data;
      return {
        streak: { count, doneToday: counted_today, days },
        streakBreak:
          missed.length > 0
            ? {
                missed,
                days: await fetchMissedDays(missed, todayOn),
                freezes,
                savedCount: saved_count,
              }
            : null,
      };
    },
  });
  // Read while rendering, so that a change of them renders again.
  return {
    streak: shown ?? query.data?.streak ?? NO_STREAK,
    streakBreak: shown ? null : (query.data?.streakBreak ?? null),
    failed: query.isError,
    retry: query.refetch,
  };
}

/** Shows a sample streak instead of the user's, or the user's again with null. */
export function showSampleStreak(streak: Streak | null) {
  sample = streak;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Answers the break of the streak on the device's `today` (answer_streak_break()): freezes its
 * missed days, or starts again. The streak is loaded again either way.
 */
export function useAnswerBreak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ today, useFreezes }: { today: Date; useFreezes: boolean }) => {
      const { error } = await supabase.rpc('answer_streak_break', {
        today: toIsoDate(today),
        use_freezes: useFreezes,
      });
      if (error) {
        throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
  });
}
