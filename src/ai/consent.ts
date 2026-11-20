// The consent to the AI features (#290, ADR 0142): Bite and meals from photos send health data to
// Google, so ai_access() refuses them as consent_required until the user gives it.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { CONSENTS_KEY } from '@/privacy/consents';
import { REQUIREMENTS_KEY, useAgreementVersion } from '@/requirements/requirements';

import { ACCESS_KEY } from './access';

/**
 * Records the consent to the current version of its text, then reads access again, so that what
 * asked for it opens.
 */
export function useGiveAiConsent() {
  const queryClient = useQueryClient();
  const version = useAgreementVersion('ai_consent');
  return useMutation({
    meta: { where: 'Could not save the AI consent', expects: ['notCurrentConsent'] },
    mutationFn: async () => {
      const { error } = await supabase.from('ai_consents').insert({ consent_version: version });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ACCESS_KEY }),
        queryClient.invalidateQueries({ queryKey: CONSENTS_KEY }),
      ]),
    // Refused as no longer the current text: the server names the one to consent to, and the
    // next try records that.
    onError: () => queryClient.invalidateQueries({ queryKey: REQUIREMENTS_KEY }),
  });
}
