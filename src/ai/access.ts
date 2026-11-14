// Whether the user may use an AI feature now (ADR 0051, 0078), which every feature asks before it
// offers itself: Bite's chat, or meal photos, which a free user has a few of a week.
import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { oneOf } from '@/lib/one-of';
import { supabase } from '@/lib/supabase';

export const ACCESS_KEY = ['ai', 'access'];

type AccessReason = Database['public']['Enums']['ai_access_reason'];
type Feature = Database['public']['Enums']['ai_feature'];

/**
 * Why the user may not use AI at all now, as ai_access() says: `service_paused` once all users
 * together have reached the month's AI spend limit (ADR 0134), which no plan lifts.
 */
export const REFUSALS = [
  'account_required',
  'plan_required',
  'limit_reached',
  'service_paused',
] as const satisfies readonly AccessReason[];
export type Refusal = (typeof REFUSALS)[number];

/** Whether a refusal is the plan's, which premium lifts, not the use of a plan that has Bite. */
export const needsPremium = (refusal?: Refusal) =>
  refusal === 'plan_required' || refusal === 'account_required';

/**
 * What ai_access() says: why the user may not use a feature, when that opens again, and whether
 * the feature is counted rather than budgeted, as meal photos on the free plan are.
 */
export type AiAccess = { refusal?: Refusal; resetsAt?: Date; byCount: boolean };

/**
 * When a counted feature opens again, if `refusal` means its count is used up, as the free plan's
 * meal photos; undefined for anything else, such as a plan's budget.
 */
export function countUsedUpUntil(access?: AiAccess, refusal = access?.refusal) {
  return access?.byCount && refusal === 'limit_reached' ? access.resetsAt : undefined;
}

/** Whether the user may use `feature` now, and when the window that refuses it opens again. */
export function useAiAccess(feature: Feature, options?: { retry?: false }) {
  return useQuery({
    queryKey: [...ACCESS_KEY, feature],
    ...options,
    queryFn: async (): Promise<AiAccess> => {
      const { data, error } = await supabase.rpc('ai_access', { feature });
      if (error) {
        throw error;
      }
      return {
        refusal: oneOf(REFUSALS, data.reason ?? undefined),
        resetsAt: data.resets_at ? new Date(data.resets_at) : undefined,
        byCount: data.by_count ?? false,
      };
    },
  });
}

/**
 * Whether the user may chat with Bite, for the screen that decides what opens: `readOnly` when the
 * plan has no chat, and `settled` once no read is under way, as what is cached may be from before
 * the plan changed. Bite waits for it; one that fails goes on at once, not after tries, as the
 * server refuses what the user may not do anyway.
 */
export function useChatAccess() {
  const query = useAiAccess('coach_chat', { retry: false });
  return {
    query,
    answer: query.data,
    readOnly: needsPremium(query.data?.refusal),
    settled: !query.isFetching,
  };
}
