// The consent to read the phone's health store (#711, ADR 0166). The system's own dialog names
// neither Benchbite nor what the data is for, so the consent sheet says both and its answer is
// recorded on the server before the system asks.
import { supabase } from '@/lib/supabase';

import type { HealthStore } from './types';

/** The version of the consent sheet's text, recorded with each consent. */
export const HEALTH_APP_CONSENT_VERSION = '2026-11-23';

const SERVER_NAMES = { appleHealth: 'apple_health', healthConnect: 'health_connect' } as const;

/** Records the user's consent to read the store; throws when it was not recorded. */
export async function giveHealthAppConsent(store: NonNullable<HealthStore>): Promise<void> {
  const { error } = await supabase.rpc('give_health_app_consent', {
    store: SERVER_NAMES[store],
    consent_version: HEALTH_APP_CONSENT_VERSION,
  });
  if (error) throw error;
}

/** Records that the user stopped reading the store, which ends the consent. */
export async function withdrawHealthAppConsent(): Promise<void> {
  const { error } = await supabase.rpc('withdraw_health_app_consent');
  if (error) throw error;
}

/** Whether the user's consent to read the store holds now. */
export async function hasHealthAppConsent(): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_health_app_consent');
  if (error) throw error;
  return data === true;
}
