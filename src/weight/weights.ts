import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import type { WeightUnit } from '@/i18n/units';
import { supabase } from '@/lib/supabase';
import { NUTRITION_DAYS_KEY } from '@/nutrition/day-nutrition';
import { rangeStart, type ProgressRange } from '@/lib/ranges';
import { STREAK_KEY } from '@/streak/streak';

/** The query keys of the weights, which logging one reloads. */
export const WEIGHTS_KEY = ['weights'];

export type WeightEntry = {
  weightKg: number;
  /** The day, YYYY-MM-DD. */
  measuredOn: string;
};

/** The unit the signed-in user chose for weights in the onboarding; kilograms without a profile. */
export function useWeightUnit() {
  return useQuery({
    queryKey: ['profile', 'weight-unit'],
    queryFn: async (): Promise<WeightUnit> => {
      const { data, error } = await supabase.from('profiles').select('weight_unit').maybeSingle();
      if (error) {
        throw error;
      }
      return data?.weight_unit ?? 'kg';
    },
  });
}

/** The signed-in user's latest weight, or null before the first one. */
export function useLatestWeight() {
  return useQuery({
    queryKey: [...WEIGHTS_KEY, 'latest'],
    queryFn: async (): Promise<WeightEntry | null> => {
      const { data, error } = await supabase
        .from('weight_entries')
        .select('weight_kg, measured_on')
        .order('measured_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data ? { weightKg: data.weight_kg, measuredOn: data.measured_on } : null;
    },
  });
}

/**
 * The signed-in user's weights from the start of `range` to `today`, oldest first. Another range
 * keeps the last one shown until it loads.
 */
export function useWeightHistory(range: ProgressRange, today: Date) {
  const from = toIsoDate(rangeStart(range, today));
  return useQuery({
    queryKey: [...WEIGHTS_KEY, 'history', from],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<WeightEntry[]> => {
      const { data, error } = await supabase
        .from('weight_entries')
        .select('weight_kg, measured_on')
        .gte('measured_on', from)
        .order('measured_on');
      if (error) {
        throw error;
      }
      return data.map((row) => ({ weightKg: row.weight_kg, measuredOn: row.measured_on }));
    },
  });
}

/** How much the weight changed from the first entry to the last, or null with fewer than two. */
export function weightChange(entries: readonly WeightEntry[]): number | null {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (!first || !last || entries.length < 2) {
    return null;
  }
  return Math.round((last.weightKg - first.weightKg) * 10) / 10;
}

/**
 * Logs today's weight, or corrects it if it was logged today already. The targets depend on the
 * latest weight, so they are loaded again too.
 */
export function useLogWeight() {
  const queryClient = useQueryClient();
  return useMutation({
    // One save at a time, so that on a slow connection an earlier weight cannot land last.
    scope: { id: 'log-weight' },
    // The calculated targets follow the weight, and today with them, in the same call.
    mutationFn: async (weightKg: number) => {
      const { error } = await supabase.rpc('log_weight', {
        weight_kg: weightKg,
        today: toIsoDate(new Date()),
      });
      if (error) {
        throw error;
      }
    },
    // Today's calories are counted for the streak and charted against the targets, which follow
    // the weight.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: WEIGHTS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-targets'] }),
        queryClient.invalidateQueries({ queryKey: NUTRITION_DAYS_KEY }),
        queryClient.invalidateQueries({ queryKey: STREAK_KEY }),
      ]),
  });
}
