// Whether the user may use an AI feature now (ADR 0051, 0078), which every feature asks before it
// offers itself: Bite's chat, or meal photos, which a free user has a few of a week.
import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { oneOf } from '@/lib/one-of';
import { supabase } from '@/lib/supabase';

export const ACCESS_KEY = ['ai', 'access'];

type AccessReason = Database['public']['Enums']['ai_access_reason'];
type Feature = Database['public']['Enums']['ai_feature'];

/** Why the user may not use AI at all now, as ai_access() says. */
export const REFUSALS = [
  'account_required',
  'plan_required',
  'limit_reached',
] as const satisfies readonly AccessReason[];
export type Refusal = (typeof REFUSALS)[number];

/** Whether a refusal is the plan's, which premium lifts, not the use of a plan that has Bite. */
export const needsPremium = (refusal?: Refusal) =>
  refusal === 'plan_required' || refusal === 'account_required';

/** Whether the user may use `feature` now, and when the window that refuses it opens again. */
export function useAiAccess(feature: Feature) {
  return useQuery({
    queryKey: [...ACCESS_KEY, feature],
    // Bite waits for it before a new chat shows; one that fails goes on at once, not after tries,
    // as the server refuses what the user may not do anyway.
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_access', { feature });
      if (error) {
        throw error;
      }
      return {
        refusal: oneOf(REFUSALS, data.reason ?? undefined),
        resetsAt: data.resets_at ? new Date(data.resets_at) : undefined,
      };
    },
  });
}
