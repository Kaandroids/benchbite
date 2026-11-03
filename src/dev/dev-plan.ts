// The plan switcher of the developer tools (ADR 0080): which plan the signed-in account is on,
// and switching it with dev_set_plan(), which only a local stack with dev_tools in Vault allows.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { reloadAfterPlanChange } from '@/premium/reload';

export type Plan = Database['public']['Enums']['plan'];

export const PLANS = ['free', 'trial', 'premium'] as const satisfies readonly Plan[];

const DEV_PLAN_KEY = ['dev-plan'];

/**
 * The plan the user is on now: free unless has_premium() says otherwise, and then the plan of
 * their subscription, which they may read.
 */
export function useDevPlan() {
  return useQuery({
    queryKey: DEV_PLAN_KEY,
    queryFn: async (): Promise<Plan> => {
      const [premium, subscription] = await Promise.all([
        supabase.rpc('has_premium'),
        supabase.from('subscriptions').select('plan').maybeSingle(),
      ]);
      if (premium.error) {
        throw premium.error;
      }
      if (subscription.error) {
        throw subscription.error;
      }
      return premium.data && subscription.data ? subscription.data.plan : 'free';
    },
  });
}

/** Puts the user on `plan`, and loads again what depends on it. */
export function useSetDevPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Plan) => {
      const { error } = await supabase.rpc('dev_set_plan', { plan });
      if (error) {
        throw error;
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: DEV_PLAN_KEY }),
        reloadAfterPlanChange(queryClient),
      ]),
  });
}
