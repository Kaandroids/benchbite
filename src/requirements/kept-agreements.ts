// What the device keeps for its user about the texts they agreed to (ADR 0158, ADR 0159): the
// version of the terms they accepted and of the health data consent they gave last, as the server
// last said them, so that a new text can show before the app at its start; and the day they chose
// "Later" for a version of the terms. Each names its user, as a phone can have had another.
import { readItem, writeItem } from '@/lib/device-storage';

/** The texts whose last agreed version is kept. */
export type KeptAgreement = 'terms' | 'health_consent';

const AGREED_STORED: Record<KeptAgreement, string> = {
  terms: 'terms-accepted',
  health_consent: 'health-consent-given',
};
const PUT_OFF_STORED = 'terms-put-off';

/** The version a user agreed to last, or null for none. */
export type KeptAgreed = { userId: string; version: string | null };

/** The day "Later" was last chosen, by whom and for which version. */
export type PutOff = { userId: string; version: string; day: string };

function readKept(key: string): Record<string, unknown> | null {
  try {
    const kept: unknown = JSON.parse(readItem(key) ?? 'null');
    return typeof kept === 'object' && kept !== null ? (kept as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** What was kept for this user: what was kept for another says nothing of them. */
export function readAgreed(
  agreement: KeptAgreement,
  forUser: string | undefined,
): KeptAgreed | null {
  const { userId, version } = readKept(AGREED_STORED[agreement]) ?? {};
  return typeof userId === 'string' &&
    userId === forUser &&
    (typeof version === 'string' || version === null)
    ? { userId, version }
    : null;
}

export function keepAgreed(agreement: KeptAgreement, agreed: KeptAgreed) {
  writeItem(AGREED_STORED[agreement], JSON.stringify(agreed));
}

/** What this user chose: another user of the phone put nothing off for them. */
export function readPutOff(forUser: string | undefined): PutOff | null {
  const { userId, version, day } = readKept(PUT_OFF_STORED) ?? {};
  return typeof userId === 'string' &&
    userId === forUser &&
    typeof version === 'string' &&
    typeof day === 'string'
    ? { userId, version, day }
    : null;
}

export function keepPutOff(putOff: PutOff) {
  writeItem(PUT_OFF_STORED, JSON.stringify(putOff));
}

/**
 * Forgets them all, with what else the device keeps for its user: an onboarding that starts again
 * records its own acceptance and consent, which the kept ones would be behind.
 */
export function forgetAgreementsOnDevice() {
  Object.values(AGREED_STORED).forEach((key) => writeItem(key, null));
  writeItem(PUT_OFF_STORED, null);
}
