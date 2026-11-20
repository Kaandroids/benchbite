// Asking a user for the health data consent again when its text changes (#690, ADR 0159). The
// onboarding records the first consent; once the server names another version of the text, a user
// who finished the onboarding is asked again, in place of the app: the app cannot work on health
// data without the consent, so there is no "Later".
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { supabase } from '@/lib/supabase';
import { CONSENTS_KEY } from '@/privacy/consents';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useSession, useUserId } from '@/providers/session-provider';

import { setLastAgreed, summaryOf, useLastAgreed } from './last-agreed';
import { REQUIREMENTS_KEY, useAgreement } from './requirements';

/** The newer text of the health data consent a user is asked to agree to. */
export type ConsentAsk = {
  version: string;
  /** What changed, in the user's language or else in English, when the version says. */
  summary?: string;
};

/** The version of the user's latest consent, or null for none, as the server holds it. */
async function readGivenConsent(): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from('health_data_consents')
    .select('policy_version')
    .order('granted_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  return rows[0]?.policy_version ?? null;
}

/**
 * The consent to ask the user for now, or null: when the server names a version other than the one
 * they consented to last, once they finished the onboarding, which asks by itself. Nothing is
 * asked while either is not known, nor of a user without any consent, whom the onboarding asks.
 */
export function useConsentAsk(): ConsentAsk | null {
  const { status } = useSession();
  const { completed } = useOnboarding();
  const { i18n } = useTranslation();
  const current = useAgreement('health_consent');
  const asked = status === 'ready' && completed;
  const given = useLastAgreed('health_consent', asked, readGivenConsent);

  if (!asked || !current || given === undefined || given === null) return null;
  if (given === current.version) return null;
  return { version: current.version, summary: summaryOf(current, i18n.language) };
}

/** Records the user's consent to this version of the text, which ends the question. */
export function useGiveHealthConsent() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    meta: {
      where: 'Could not save the health data consent',
      expects: ['notCurrentConsent', 'noHealthConsent'],
    },
    mutationFn: async (version: string) => {
      const { error } = await supabase.rpc('give_health_consent', { policy_version: version });
      if (error) throw error;
      return version;
    },
    onSuccess: async (version) => {
      await setLastAgreed(queryClient, 'health_consent', userId, version);
      // When it was given shows in the settings.
      await queryClient.invalidateQueries({ queryKey: CONSENTS_KEY });
    },
    // Refused as no longer the current text: the server names the one to show.
    onError: () => queryClient.invalidateQueries({ queryKey: REQUIREMENTS_KEY }),
  });
}
