// What the device keeps about the terms of use for its user (ADR 0158): the version they accepted
// last, as the server last said it, so that new terms can show before the app at its start; and
// the day they chose "Later" for a version. Each names its user, as a phone can have had another.
import { readItem, writeItem } from '@/lib/device-storage';

const ACCEPTED_STORED = 'terms-accepted';
const PUT_OFF_STORED = 'terms-put-off';

/** The version a user accepted last, or null for none. */
export type KeptAccepted = { userId: string; version: string | null };

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

export function readAccepted(): KeptAccepted | null {
  const { userId, version } = readKept(ACCEPTED_STORED) ?? {};
  return typeof userId === 'string' && (typeof version === 'string' || version === null)
    ? { userId, version }
    : null;
}

export function keepAccepted(accepted: KeptAccepted) {
  writeItem(ACCEPTED_STORED, JSON.stringify(accepted));
}

export function readPutOff(): PutOff | null {
  const { userId, version, day } = readKept(PUT_OFF_STORED) ?? {};
  return typeof userId === 'string' && typeof version === 'string' && typeof day === 'string'
    ? { userId, version, day }
    : null;
}

export function keepPutOff(putOff: PutOff) {
  writeItem(PUT_OFF_STORED, JSON.stringify(putOff));
}

/**
 * Forgets both, with what else the device keeps for its user: an onboarding that starts again
 * records its own acceptance, which the kept one would be behind.
 */
export function forgetTermsOnDevice() {
  writeItem(ACCEPTED_STORED, null);
  writeItem(PUT_OFF_STORED, null);
}
