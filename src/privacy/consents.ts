// The consents the user gave and can withdraw (#652): to process health data, asked in the
// onboarding, and to the AI features (ADR 0142). Withdrawing either deletes what rests on it, on
// the server (ADR 0143, 0144).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';

export const CONSENTS_KEY = ['privacy', 'consents'];

/** When each consent was given, for those that hold now: given and not withdrawn since. */
export type Consents = { health?: Date; ai?: Date };

type Table =
  | 'health_data_consents'
  | 'health_data_consent_withdrawals'
  | 'ai_consents'
  | 'ai_consent_withdrawals';

/** The latest time in `column` of the user's rows of `table`, which they read their own of. */
async function latest(table: Table, column: 'granted_at' | 'withdrawn_at') {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .order(column, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const value = (data as Record<string, string> | null)?.[column];
  return value ? new Date(value) : undefined;
}

/** A consent given after its last withdrawal, as the server counts it. */
function holding(given?: Date, withdrawn?: Date) {
  return given && (!withdrawn || given > withdrawn) ? given : undefined;
}

/** The consents that hold now, with when they were given. */
export function useConsents() {
  return useQuery({
    queryKey: CONSENTS_KEY,
    queryFn: async (): Promise<Consents> => {
      const [health, healthWithdrawn, ai, aiWithdrawn] = await Promise.all([
        latest('health_data_consents', 'granted_at'),
        latest('health_data_consent_withdrawals', 'withdrawn_at'),
        latest('ai_consents', 'granted_at'),
        latest('ai_consent_withdrawals', 'withdrawn_at'),
      ]);
      return { health: holding(health, healthWithdrawn), ai: holding(ai, aiWithdrawn) };
    },
  });
}

/**
 * Withdraws the AI consent, which deletes Bite's chats and notes. Everything is read again, as
 * Bite's data and what the user may use changed.
 */
export function useWithdrawAiConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('withdraw_ai_consent');
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/**
 * Withdraws the health data consent, which deletes the profile, the plan and every log, and the AI
 * consent with them. The app then starts the onboarding again, with nothing of before kept.
 */
export function useWithdrawHealthConsent() {
  const { restart } = useOnboarding();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('withdraw_health_consent');
      if (error) throw error;
    },
    onSuccess: restart,
  });
}
