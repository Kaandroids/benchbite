// Asking a user to accept the terms of use again when they change (#689, ADR 0158). The onboarding
// records the first acceptance; once the server names a newer version, a user who finished the
// onboarding is asked: before the day the terms apply with a way to put it off for the day, and
// from that day until they accept.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toIsoDate } from '@/i18n/dates';
import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useSession, useUserId } from '@/providers/session-provider';

import { REQUIREMENTS_KEY, useAgreement } from './requirements';

const ACCEPTED_KEY = ['terms', 'accepted'];
const MOMENT_KEY = ['terms', 'moment'];
const PUT_OFF_STORED = 'terms-put-off';

/** The newer terms a user is asked to accept. */
export type TermsAsk = {
  version: string;
  appliesAt: Date;
  /** Whether they apply already: the app then waits for the answer. */
  due: boolean;
  /** What changed, in the user's language or else in English, when the version says. */
  summary?: string;
};

/** The version the user accepted last, or null for none; nothing while it is not known. */
function useAcceptedTerms(enabled: boolean): string | null | undefined {
  const { data } = useQuery({
    queryKey: ACCEPTED_KEY,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('terms_acceptances')
        .select('terms_version')
        .order('accepted_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      if (error) throw error;
      return rows[0]?.terms_version ?? null;
    },
    enabled,
  });
  return data;
}

/** The day "Later" was last chosen on this device, by whom and for which version. */
type PutOff = { userId: string; version: string; day: string };

function readPutOff(): PutOff | null {
  try {
    const kept: unknown = JSON.parse(readItem(PUT_OFF_STORED) ?? 'null');
    const { userId, version, day } = (kept ?? {}) as Record<keyof PutOff, unknown>;
    return typeof userId === 'string' && typeof version === 'string' && typeof day === 'string'
      ? { userId, version, day }
      : null;
  } catch {
    return null;
  }
}

/** The moment the question was last weighed, and whether it was put off for that day. */
type Moment = { at: number; putOff: boolean };

/**
 * The time, and whether this user put the question for this version off today: another user of
 * the phone did not. Read again each time the app comes back, so that the question returns the
 * next day and the day the terms apply is noticed; not read while there is nothing to ask about.
 */
function useMoment(userId: string | undefined, version: string | undefined): Moment | undefined {
  const { data } = useQuery({
    queryKey: [...MOMENT_KEY, userId, version],
    queryFn: (): Moment => {
      const now = new Date();
      const kept = readPutOff();
      return {
        at: now.getTime(),
        putOff:
          kept !== null &&
          kept.userId === userId &&
          kept.version === version &&
          kept.day === toIsoDate(now),
      };
    },
    enabled: userId !== undefined && version !== undefined,
    staleTime: 0,
  });
  return data;
}

/**
 * The terms to ask the user for now, or null: when the server names a version other than the one
 * they accepted last, once they finished the onboarding, which asks by itself. Nothing is asked
 * while either is not known, as without the server's answer.
 */
export function useTermsAsk(): TermsAsk | null {
  const { status } = useSession();
  const { completed } = useOnboarding();
  const { i18n } = useTranslation();
  const current = useAgreement('terms');
  const asked = status === 'ready' && completed;
  const accepted = useAcceptedTerms(asked);
  const moment = useMoment(useUserId(), current?.version);

  if (!asked || !current || !moment) return null;
  if (accepted === undefined || accepted === current.version) return null;
  const appliesAt = new Date(current.appliesAt);
  // A day that cannot be read counts as come: the terms are the current ones either way.
  const due = !(appliesAt.getTime() > moment.at);
  if (!due && moment.putOff) return null;
  // An empty text in the user's language is none.
  const summary = current.summary[i18n.language]?.trim() || current.summary.en?.trim();
  return { version: current.version, appliesAt, due, summary: summary || undefined };
}

/** Records that the user accepts the terms in this version, which ends the question. */
export function useAcceptTerms() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { where: 'Could not save the acceptance of the terms', expects: ['notCurrentTerms'] },
    mutationFn: async (version: string) => {
      const { error } = await supabase.rpc('accept_terms', { terms_version: version });
      if (error) throw error;
      return version;
    },
    onSuccess: (version) => queryClient.setQueryData(ACCEPTED_KEY, version),
    // Refused as no longer the current terms: the server names the ones to show.
    onError: () => queryClient.invalidateQueries({ queryKey: REQUIREMENTS_KEY }),
  });
}

/** Puts the question for this version off until tomorrow, as "Later" does. */
export function usePutOffTerms() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return (version: string) => {
    if (userId === undefined) return;
    const now = new Date();
    const putOff: PutOff = { userId, version, day: toIsoDate(now) };
    writeItem(PUT_OFF_STORED, JSON.stringify(putOff));
    queryClient.setQueryData<Moment>([...MOMENT_KEY, userId, version], {
      at: now.getTime(),
      putOff: true,
    });
  };
}
