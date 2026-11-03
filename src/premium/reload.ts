// What loads again when the user's plan changes, whether by a purchase, a restore or the developer
// tools (ADR 0078, 0079): the workouts, of which some may now wait for premium or come back, the
// workout limits, access to AI and the summary of the plan.
import type { QueryClient } from '@tanstack/react-query';

import { ACCESS_KEY } from '@/ai/access';
import { reloadPlan, WORKOUT_LIMITS_KEY } from '@/workouts/workouts';

/** The query key of the summary of the user's plan. */
export const PLAN_SUMMARY_KEY = ['plan-summary'];

/** Loads again everything that depends on the user's plan. */
export function reloadAfterPlanChange(queryClient: QueryClient) {
  return Promise.all([
    reloadPlan(queryClient),
    queryClient.invalidateQueries({ queryKey: WORKOUT_LIMITS_KEY }),
    queryClient.invalidateQueries({ queryKey: ACCESS_KEY }),
    queryClient.invalidateQueries({ queryKey: PLAN_SUMMARY_KEY }),
  ]);
}
