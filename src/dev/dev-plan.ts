// The plan switcher of the developer tools (ADR 0080): which plan the signed-in account is on,
// as my_plan() says, and switching it with dev_set_plan(), which only a local stack with
// dev_tools in Vault allows.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { reloadAfterPlanChange } from '@/premium/reload';

export type Plan = Database['public']['Enums']['plan'];

export const PLANS = ['free', 'trial', 'premium'] as const satisfies readonly Plan[];

const DEV_PLAN_KEY = ['dev-plan'];

/** The plan the user is on now, as the server's plan_of() says through my_plan(). */
export function useDevPlan() {
  return useQuery({
    queryKey: DEV_PLAN_KEY,
    queryFn: async (): Promise<Plan> => {
      const { data, error } = await supabase.rpc('my_plan');
      if (error) {
        throw error;
      }
      return data;
    },
  });
}

/** Puts the user on `plan`, and loads again what depends on it. */
export function useSetDevPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Plan) => {
      const { data, error } = await supabase.rpc('dev_set_plan', { plan });
      if (error) {
        throw error;
      }
      return data;
    },
    // The plan the server put the user on, which it gives back, or read again if it refused.
    onSuccess: (plan) => queryClient.setQueryData(DEV_PLAN_KEY, plan),
    onError: () => queryClient.invalidateQueries({ queryKey: DEV_PLAN_KEY }),
    onSettled: () => reloadAfterPlanChange(queryClient),
  });
}
