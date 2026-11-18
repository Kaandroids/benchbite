// The consents the user gave and can withdraw (#652): to process health data, asked in the
// onboarding, and to the AI features (ADR 0142). Withdrawing either deletes what rests on it, on
// the server (ADR 0143, 0144).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';

export const CONSENTS_KEY = ['privacy', 'consents'];

/** When each consent was given, for those that hold now: given and not withdrawn since. */
export type Consents = { health?: Date; ai?: Date };

/** The consents a user gives and can withdraw. */
export type Consent = keyof Consents;

/** The consents that hold now, with when they were given, as the server's rule says. */
export function useConsents() {
  return useQuery({
    queryKey: CONSENTS_KEY,
    queryFn: async (): Promise<Consents> => {
      const { data, error } = await supabase.rpc('my_consents').single();
      if (error) throw error;
      return {
        health: data.health_given_at ? new Date(data.health_given_at) : undefined,
        ai: data.ai_given_at ? new Date(data.ai_given_at) : undefined,
      };
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
      // Withdrawn already, as on another phone: it is gone either way.
      if (error && !isDbError(error, 'noAiConsent')) throw error;
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
      // Withdrawn already, as on another phone: it is gone either way.
      if (error && !isDbError(error, 'noHealthConsent')) throw error;
    },
    onSuccess: restart,
  });
}
