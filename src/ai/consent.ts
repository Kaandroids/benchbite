// The consent to the AI features (#290, ADR 0142): Bite and meals from photos send health data to
// Google, so ai_access() refuses them as consent_required until the user gives it.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { CONSENTS_KEY } from '@/privacy/consents';

import { ACCESS_KEY } from './access';

// The version of the AI consent's text, recorded with each consent. Raising it asks no one again
// by itself: a migration must then make has_ai_consent() require that version (ADR 0142).
export const AI_CONSENT_VERSION = '2026-11-18';

/** Records the consent, then reads access again, so that what asked for it opens. */
export function useGiveAiConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { where: 'Could not save the AI consent' },
    mutationFn: async () => {
      const { error } = await supabase
        .from('ai_consents')
        .insert({ consent_version: AI_CONSENT_VERSION });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ACCESS_KEY }),
        queryClient.invalidateQueries({ queryKey: CONSENTS_KEY }),
      ]),
  });
}
