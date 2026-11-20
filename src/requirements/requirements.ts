// What this build has to hold to (#688, ADR 0156): whether its version is still supported, and the
// current version of each text a user agrees to. The app ships without updates over the air, so
// the server says these when the app opens and when it comes back to the foreground; the last
// answer is kept on the device for when the server cannot be reached. Nothing here stops the app:
// without an answer it goes on with the texts' versions it last knew, or those it was built with,
// and counts as supported unless this same version was told otherwise.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nativeApplicationVersion } from 'expo-application';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { Constants, type Database } from '@/lib/database.types';
import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';
import { onVersionRefused } from '@/lib/version-refusal';
import { useSession } from '@/providers/session-provider';

import { AI_CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from './built-with';

export const REQUIREMENTS_KEY = ['requirements'];
const STORED_KEY = 'requirements';

/** The texts a user agrees to, as the server names them. */
export type Agreement = Database['public']['Enums']['agreement'];
const AGREEMENTS: readonly Agreement[] = Constants.public.Enums.agreement;

/** A text's current version, the day it applies, and what changed, by language. */
export type AgreementVersion = {
  version: string;
  appliesAt: string;
  summary: Record<string, string>;
};

export type Requirements = {
  /** Whether this build's version is still supported on its platform. */
  supported: boolean;
  lowestVersion: string;
  agreements: Record<Agreement, AgreementVersion>;
};

/** The versions this build was made with, for when the server has not said any yet. */
const BUILT_WITH: Record<Agreement, string> = {
  terms: TERMS_VERSION,
  health_consent: PRIVACY_POLICY_VERSION,
  ai_consent: AI_CONSENT_VERSION,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseAgreement(value: unknown): AgreementVersion | null {
  if (!isRecord(value) || typeof value.version !== 'string' || value.version === '') return null;
  if (typeof value.appliesAt !== 'string') return null;
  const summary: Record<string, string> = {};
  if (isRecord(value.summary)) {
    for (const [language, text] of Object.entries(value.summary)) {
      if (typeof text === 'string') summary[language] = text;
    }
  }
  return { version: value.version, appliesAt: value.appliesAt, summary };
}

/** An answer, the server's or the one kept on the device, if it has the shape this build reads. */
export function parseRequirements(value: unknown): Requirements | null {
  if (!isRecord(value) || typeof value.supported !== 'boolean') return null;
  if (typeof value.lowestVersion !== 'string' || !isRecord(value.agreements)) return null;
  const agreements = {} as Record<Agreement, AgreementVersion>;
  for (const agreement of AGREEMENTS) {
    const parsed = parseAgreement(value.agreements[agreement]);
    if (!parsed) return null;
    agreements[agreement] = parsed;
  }
  return { supported: value.supported, lowestVersion: value.lowestVersion, agreements };
}

/**
 * The answer kept on the device, if any. Whether a build is supported was said of the version
 * that asked: kept by another version, as before an update, it says nothing of this one, which
 * then counts as supported until the server answers. The texts' versions hold for any build.
 */
function storedRequirements(): Requirements | null {
  const stored = readItem(STORED_KEY);
  if (!stored) return null;
  try {
    const kept: unknown = JSON.parse(stored);
    if (!isRecord(kept)) return null;
    const requirements = parseRequirements(kept.requirements);
    if (!requirements) return null;
    return kept.appVersion === nativeApplicationVersion
      ? requirements
      : { ...requirements, supported: true };
  } catch {
    return null;
  }
}

/** Asks the server what this build has to hold to, and keeps the answer on the device. */
async function fetchRequirements(): Promise<Requirements> {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error(`No requirements for ${platform}`);
  }
  const { data, error } = await supabase.rpc('app_requirements', {
    platform,
    // A version the server cannot read counts as supported there.
    app_version: nativeApplicationVersion ?? '',
  });
  if (error) throw error;
  const requirements = parseRequirements(data);
  if (!requirements) throw new Error('The requirements have a shape this build cannot read');
  writeItem(STORED_KEY, JSON.stringify({ appVersion: nativeApplicationVersion, requirements }));
  return requirements;
}

/**
 * What is known of the requirements: the server's latest answer, else the one kept on the device,
 * else nothing. Asks the server itself only when `asking`.
 */
function useKnownRequirements(asking: boolean): Requirements | undefined {
  // Read once: a newer answer comes from the query, which also keeps it for the next start.
  const kept = useMemo(() => storedRequirements(), []);
  const { data } = useQuery({
    queryKey: REQUIREMENTS_KEY,
    queryFn: fetchRequirements,
    enabled: asking,
  });
  return data ?? kept ?? undefined;
}

/**
 * What this build has to hold to, asked of the server once there is a session, when the app opens
 * and each time it comes back to the foreground. The root layout calls it; what needs an answer
 * elsewhere reads the one it got.
 */
export function useRequirements(): Requirements | undefined {
  const { status } = useSession();
  const queryClient = useQueryClient();
  // A request the backend refused says this build is no longer supported, whenever it was last
  // asked (ADR 0157): asking again puts the update screen in the app's place.
  useEffect(
    () =>
      // A screen's requests are refused together: one question answers them all.
      onVersionRefused(
        () =>
          void queryClient.invalidateQueries(
            { queryKey: REQUIREMENTS_KEY },
            { cancelRefetch: false },
          ),
      ),
    [queryClient],
  );
  return useKnownRequirements(status === 'ready');
}

/**
 * What the server last said of a text, also when kept on the device from before: its current
 * version, the day it applies and what changed. Nothing while the server never answered.
 */
export function useAgreement(agreement: Agreement): AgreementVersion | undefined {
  return useKnownRequirements(false)?.agreements[agreement];
}

/** The current version of a text: the server's, else the one this build was made with. */
export function useAgreementVersion(agreement: Agreement): string {
  return useKnownRequirements(false)?.agreements[agreement].version ?? BUILT_WITH[agreement];
}
