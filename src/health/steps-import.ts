// Steps taken from the phone's health store (#469, ADR 0103). While the store is connected and steps
// are read, the store's total of each day goes to import_steps(): the last year the first time, then
// the last 30 days, so a watch that syncs late still fills its days. It keeps a day's higher total.
import type { QueryClient } from '@tanstack/react-query';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { STEPS_KEY } from '@/steps/steps';

import { setStepsYearRead, stepsYearRead } from './connection';
import { lastDays, mayImport, oneAtATime, signedInUser, stillImporting } from './import-guard';
import { dailySteps } from './platform';

/**
 * How many days, today among them, the first read goes back, and each later one; import_steps()
 * takes a year and a day.
 */
const FIRST_READ_DAYS = 366;
const READ_DAYS = 30;

async function importNow(queryClient: QueryClient): Promise<boolean> {
  if (!mayImport('steps')) return false;
  const userId = await signedInUser();
  const now = new Date();
  const firstRead = !stepsYearRead();
  const days = await dailySteps(lastDays(firstRead ? FIRST_READ_DAYS : READ_DAYS, now));
  // Another user may have signed in while the store was read, which lets go of the connection.
  if (!(await stillImporting('steps', userId))) return false;
  let changed = false;
  if (days.length) {
    const { data, error } = await supabase.rpc('import_steps', { days, today: toIsoDate(now) });
    if (error) throw error;
    changed = (data ?? 0) > 0;
  }
  // Only a read that found steps counts as the year's: one made while steps could not be read finds
  // none, and the year is read again once they can. Nor does it count for a user signed in since.
  if (firstRead && days.length && (await stillImporting('steps', userId))) setStepsYearRead(true);
  if (changed) await queryClient.invalidateQueries({ queryKey: STEPS_KEY });
  return changed;
}

/** Reads the store's steps of each day and keeps them; whether any day changed. */
export const importHealthSteps = oneAtATime(importNow);
