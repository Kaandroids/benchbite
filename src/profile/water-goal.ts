import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

/** The goal before the user sets one, as the profiles table has it. */
export const DEFAULT_WATER_GOAL_ML = 2000;

/** The goals the settings offer, in millilitres. */
export const WATER_GOALS_ML = [1500, 2000, 2500, 3000] as const;

const QUERY_KEY = ['profile', 'water-goal'];
const MUTATION_KEY = ['set-water-goal'];

/** The signed-in user's daily water goal in millilitres. */
export function useWaterGoal() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('profiles').select('water_goal_ml').maybeSingle();
      if (error) {
        throw error;
      }
      return data?.water_goal_ml ?? DEFAULT_WATER_GOAL_ML;
    },
  });
}

/**
 * Changes the signed-in user's daily water goal. It shows at once, and the goal is loaded again
 * once the last change is saved, so that quick changes end on the one saved last.
 */
export function useSetWaterGoal() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationKey: MUTATION_KEY,
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
    },
    onMutate: async (ml) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      queryClient.setQueryData(QUERY_KEY, ml);
    },
    onSettled: () =>
      queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1
        ? queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        : undefined,
  });
}
