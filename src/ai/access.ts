// Whether the user may use AI features now (ADR 0051), which every feature asks before it offers
// one: Bite's chat, and later meal photos.
import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { oneOf } from '@/lib/one-of';
import { supabase } from '@/lib/supabase';

export const ACCESS_KEY = ['ai', 'access'];

type AccessReason = Database['public']['Enums']['ai_access_reason'];

/** Why the user may not use AI at all now, as ai_access() says. */
export const REFUSALS = [
  'account_required',
  'plan_required',
  'limit_reached',
] as const satisfies readonly AccessReason[];
export type Refusal = (typeof REFUSALS)[number];

/** Whether the user may use AI this month, and when the month's budget resets. */
export function useAiAccess() {
  return useQuery({
    queryKey: ACCESS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_access');
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
