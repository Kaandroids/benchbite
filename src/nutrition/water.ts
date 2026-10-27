import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/** A glass, which + and − add and take away. */
export const GLASS_ML = 250;

/** The most a day holds, as water_days does. */
const MAX_WATER_ML = 10000;

const waterKey = (day: string) => ['water', day];

/** The water drunk on a day, YYYY-MM-DD, in millilitres; 0 before the first glass. */
export function useWater(day: string) {
  return useQuery({
    queryKey: waterKey(day),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('water_days')
        .select('ml')
        .eq('day', day)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data?.ml ?? 0;
    },
  });
}

/**
 * Adds a glass to a day, or takes one away with a negative amount. The total shows the change at
 * once. Taps can run side by side and their answers come back in any order, so the day is loaded
 * again once the last one is done, rather than trusting any one answer.
 */
export function useAddWater(day: string) {
  const queryClient = useQueryClient();
  const mutationKey = ['add-water', day];
  return useMutation({
    mutationKey,
    mutationFn: async (ml: number) => {
      const { error } = await supabase.rpc('add_water', { on_day: day, amount_ml: ml });
      if (error) {
        throw error;
      }
    },
    onMutate: async (ml) => {
      await queryClient.cancelQueries({ queryKey: waterKey(day) });
      queryClient.setQueryData<number>(waterKey(day), (total = 0) =>
        Math.min(MAX_WATER_ML, Math.max(0, total + ml)),
      );
    },
    onSettled: () =>
      queryClient.isMutating({ mutationKey }) === 1
        ? queryClient.invalidateQueries({ queryKey: waterKey(day) })
        : undefined,
  });
}
