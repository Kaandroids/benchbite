// Steps taken from the phone's health store (#469, ADR 0103). While the store is connected and steps
// are read, the store's total of each day goes to import_steps(): the last year the first time, then
// from the day last read on and at least the last 30 days, so neither a watch that syncs late nor
// weeks without opening the app leave days out. It keeps a day's higher total.
import type { QueryClient } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { STEPS_KEY } from '@/steps/steps';

import { setStepsReadOn, stepsReadOn } from './connection';
import {
  MOST_DAYS,
  mayImport,
  oneAtATime,
  readFrom,
  signedInUser,
  stillImporting,
} from './import-guard';
import { dailySteps } from './platform';

async function importNow(queryClient: QueryClient): Promise<boolean> {
  if (!mayImport('steps')) return false;
  const userId = await signedInUser();
  const now = new Date();
  // Read up to the moment `today` is of, so a read across midnight stays within import_steps()'s
  // days.
  const days = await dailySteps(readFrom(stepsReadOn(), MOST_DAYS, now), now);
  // Another user may have signed in while the store was read, which lets go of the connection.
  if (!(await stillImporting('steps', userId))) return false;
  let changed = false;
  if (days.length) {
    const { data, error } = await supabase.rpc('import_steps', { days, today: toIsoDate(now) });
    if (error) throw error;
    changed = (data ?? 0) > 0;
  }
  // Only a read that found steps moves the day on: one made while steps could not be read finds
  // none, and the next read goes back as far again. Nor does it count for a user signed in since.
  if (days.length && (await stillImporting('steps', userId))) setStepsReadOn(toIsoDate(now));
  if (changed) await queryClient.invalidateQueries({ queryKey: STEPS_KEY });
  return changed;
}

/** Reads the store's steps of each day and keeps them; whether any day changed. */
export const importHealthSteps = oneAtATime(importNow);
