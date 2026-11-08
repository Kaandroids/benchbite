// The day's steps the phone's health store counted, kept with the account (#469, ADR 0103).
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { StepDay } from '@/health/health';
import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

/** The key of every query of steps, which an import that changed a day refreshes. */
export const STEPS_KEY = ['steps'];

export type { StepDay } from '@/health/health';

/**
 * The signed-in user's steps from `from` to `to`, oldest first; a day without a count is left out.
 * Another span keeps the last one shown until it loads.
 */
export function useStepDays(from: Date, to: Date) {
  const first = toIsoDate(from);
  const last = toIsoDate(to);
  return useQuery({
    queryKey: [...STEPS_KEY, first, last],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StepDay[]> => {
      const { data, error } = await supabase
        .from('step_days')
        .select('day, steps')
        .gte('day', first)
        .lte('day', last)
        .order('day');
      if (error) {
        throw error;
      }
      return data;
    },
  });
}

/** The average steps a day over the days counted, or null without any. */
export function averageSteps(days: readonly StepDay[]): number | null {
  if (days.length === 0) {
    return null;
  }
  return days.reduce((sum, { steps }) => sum + steps, 0) / days.length;
}

/** The days that are over, leaving out today, which is still being counted. */
export function pastDays(days: readonly StepDay[], today: Date): StepDay[] {
  const todayOn = toIsoDate(today);
  return days.filter(({ day }) => day !== todayOn);
}
