// The day's steps the phone's health store counted, kept with the account (#469, ADR 0103).
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

/** The key of every query of steps, which an import that changed a day refreshes. */
export const STEPS_KEY = ['steps'];

/** The steps of a day, as YYYY-MM-DD. */
export type StepDay = { day: string; steps: number };

/**
 * The signed-in user's steps from `from` to `to`, oldest first; a day without a count is left out.
 * Another span keeps the last one shown until it loads.
 */
export function useStepDays(from: Date, to: Date, enabled = true) {
  const first = toIsoDate(from);
  const last = toIsoDate(to);
  return useQuery({
    queryKey: [...STEPS_KEY, first, last],
    enabled,
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

/** The average steps a day over the days counted, rounded, or null without any. */
export function averageSteps(days: readonly StepDay[]): number | null {
  if (days.length === 0) {
    return null;
  }
  return Math.round(days.reduce((sum, { steps }) => sum + steps, 0) / days.length);
}
