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

/** How each day of the week of `week` counted for the streak (streak_states()), by its date. */
async function fetchCountedDays(week: Date, today: string): Promise<Record<string, DayStatus>> {
  const monday = weekStart(week);
  const { data, error } = await supabase.rpc('streak_states', {
    from_day: toIsoDate(monday),
    to_day: toIsoDate(addDays(monday, 6)),
    today,
  });
  if (error) {
    throw error;
  }
  const days: Record<string, DayStatus> = {};
  for (const { day, state } of data) {
    if (state === 'done' || state === 'frozen') {
      days[day] = state;
    }
  }
  return days;
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
      const [streak, days] = await Promise.all([
        supabase.rpc('streak', { today: todayOn }).single(),
        fetchCountedDays(today, todayOn),
      ]);
      if (streak.error) {
        throw streak.error;
      }
      const { count, counted_today, freezes, missed, saved_count } = streak.data;
      return {
        streak: { count, doneToday: counted_today, days },
        streakBreak:
          missed.length > 0
            ? {
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

/** How each day of the week of `week` counted for the streak, as seen on the device's `today`. */
export function useWeekStreak(today: Date, week: Date) {
  const todayOn = toIsoDate(today);
  return useQuery({
    queryKey: [...STREAK_KEY, 'week', toIsoDate(weekStart(week)), todayOn],
    queryFn: () => fetchCountedDays(week, todayOn),
  });
}

/**
 * The user's first day, back to which the week strip pages (ADR 0043): the day their plan started,
 * or the day the account was created.
 */
export function useStreakStart() {
  return useQuery({
    queryKey: [...STREAK_KEY, 'start'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('streak_start');
      if (error) {
        throw error;
      }
      return data;
    },
  });
}
