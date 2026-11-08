// Weights taken from the phone's health store, as from a smart scale (#22, ADR 0100). While the
// store is connected and weight is read, the last 30 days' weighings go to import_weights() as the
// latest of each day; it keeps them unless the user entered a weight that day, and writes only the
// days that changed. Reading all 30 days each time takes in a weighing that a scale's app wrote to
// the store days late.
import type { QueryClient } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { reloadAfterWeight } from '@/weight/weights';

import { mayImport, oneAtATime, signedInUser, stillImporting } from './import-guard';
import { weightsSince } from './platform';
import type { WeightReading } from './types';

const DAY_MS = 24 * 3600 * 1000;
/** How far back each read goes. */
const READ_DAYS = 30;

/** The latest weighing of each day, by the phone's day, oldest first. */
export function latestPerDay(
  readings: readonly WeightReading[],
): { day: string; weightKg: number; source: string | null }[] {
  const days = new Map<string, WeightReading>();
  for (const reading of readings) {
    const day = toIsoDate(reading.at);
    const kept = days.get(day);
    if (!kept || reading.at >= kept.at) days.set(day, reading);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { weightKg, source }]) => ({ day, weightKg, source }));
}

async function importNow(queryClient: QueryClient): Promise<boolean> {
  if (!mayImport('weight')) return false;
  const userId = await signedInUser();
  const now = new Date();
  const days = latestPerDay(await weightsSince(new Date(now.getTime() - READ_DAYS * DAY_MS)));
  // Another user may have signed in while the store was read, which lets go of the connection.
  if (!days.length || !(await stillImporting('weight', userId))) return false;
  const { data, error } = await supabase.rpc('import_weights', {
    weights: days,
    today: toIsoDate(now),
  });
  if (error) throw error;
  const changed = (data ?? 0) > 0;
  if (changed) await reloadAfterWeight(queryClient);
  return changed;
}

/** Reads the store's last 30 days of weights and keeps them; whether any day changed. */
export const importHealthWeights = oneAtATime(importNow);
