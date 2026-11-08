// Weights taken from the phone's health store, as from a smart scale (#22, ADR 0100). While the
// store is connected and weight is read, the weighings since the last read, at most 30 days back,
// go to import_weights() as the latest of each day; it keeps them unless the user entered a weight
// that day.
import type { QueryClient } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { reloadAfterWeight } from '@/weight/weights';

import { isHealthConnected, setWeightsReadAt, weightReading, weightsReadAt } from './connection';
import { weightsSince } from './platform';
import type { WeightReading } from './types';

const DAY_MS = 24 * 3600 * 1000;
/** How far back the first read goes. */
const FIRST_READ_DAYS = 30;

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

/** Where the next read starts: a day before the last one, for a weighing written late, or 30 days back. */
function readFrom(now: Date): Date {
  const firstRead = new Date(now.getTime() - FIRST_READ_DAYS * DAY_MS);
  const last = weightsReadAt();
  return last && last > firstRead ? new Date(last.getTime() - DAY_MS) : firstRead;
}

/** Reads the store's weights since the last read and keeps them; whether any day changed. */
export async function importHealthWeights(queryClient: QueryClient): Promise<boolean> {
  if (!isHealthConnected() || weightReading() !== 'on') return false;
  const now = new Date();
  const days = latestPerDay(await weightsSince(readFrom(now)));
  let changed = false;
  if (days.length) {
    const { data, error } = await supabase.rpc('import_weights', {
      weights: days,
      today: toIsoDate(now),
    });
    if (error) throw error;
    changed = (data ?? 0) > 0;
  }
  setWeightsReadAt(now);
  if (changed) await reloadAfterWeight(queryClient);
  return changed;
}
