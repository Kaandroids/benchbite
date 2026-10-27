import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

/** A glass, which + and − add and take away. */
export const GLASS_ML = 250;

/** The goal before the user sets one, as the profiles table has it. */
export const DEFAULT_WATER_GOAL_ML = 2000;

/** The goals the settings offer, in millilitres. */
export const WATER_GOALS_ML = [1500, 2000, 2500, 3000] as const;

const waterKey = (day: string) => ['water', day];
const GOAL_KEY = ['profile', 'water-goal'];

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
 * once and then what the database counted, which keeps it between nothing and 10 L.
 */
export function useAddWater(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ml: number): Promise<number> => {
      const { data, error } = await supabase.rpc('add_water', { on_day: day, amount_ml: ml });
      if (error) {
        throw error;
      }
      return data;
    },
    onMutate: async (ml) => {
      await queryClient.cancelQueries({ queryKey: waterKey(day) });
      const before = queryClient.getQueryData<number>(waterKey(day));
      queryClient.setQueryData<number>(waterKey(day), (total = 0) => Math.max(0, total + ml));
      return { before };
    },
    onError: (_error, _ml, context) => queryClient.setQueryData(waterKey(day), context?.before),
    onSuccess: (total) => queryClient.setQueryData(waterKey(day), total),
  });
}

/** The signed-in user's daily water goal in millilitres. */
export function useWaterGoal() {
  return useQuery({
    queryKey: GOAL_KEY,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('profiles').select('water_goal_ml').maybeSingle();
      if (error) {
        throw error;
      }
      return data?.water_goal_ml ?? DEFAULT_WATER_GOAL_ML;
    },
  });
}

/** Changes the signed-in user's daily water goal. */
export function useSetWaterGoal() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (ml: number) => {
      if (session.status !== 'ready') {
        throw new Error('Not signed in');
      }
      const { error } = await supabase
        .from('profiles')
        .update({ water_goal_ml: ml })
        .eq('user_id', session.session.user.id);
      if (error) {
        throw error;
      }
      return ml;
    },
    onSuccess: (ml) => queryClient.setQueryData(GOAL_KEY, ml),
  });
}
