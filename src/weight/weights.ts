import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import type { WeightUnit } from '@/i18n/units';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

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
    queryKey: ['weights', 'latest'],
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
 * Logs today's weight, or corrects it if it was logged today already. The targets depend on the
 * latest weight, so they are loaded again too.
 */
export function useLogWeight() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (weightKg: number) => {
      if (session.status !== 'ready') {
        throw new Error('Not signed in');
      }
      const { error } = await supabase.from('weight_entries').upsert(
        {
          user_id: session.session.user.id,
          weight_kg: weightKg,
          measured_on: toIsoDate(new Date()),
        },
        { onConflict: 'user_id,measured_on' },
      );
      if (error) {
        throw error;
      }
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['weights'] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-targets'] }),
      ]),
  });
}
