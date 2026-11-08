// Steps taken from the phone's health store (#469, ADR 0103). While the store is connected and steps
// are read, the store's total of each day goes to import_steps(): the last year the first time, then
// the last 30 days, so a watch that syncs late still fills its days. It keeps a day's higher total.
import type { QueryClient } from '@tanstack/react-query';

import { addDays, toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';
import { STEPS_KEY } from '@/steps/steps';

import { setStepsYearRead, stepsYearRead } from './connection';
import { mayImport, oneAtATime, signedInUser, stillImporting } from './import-guard';
import { dailySteps } from './platform';

/** How far back the first read goes, and each later one; import_steps() takes a year's days. */
const FIRST_READ_DAYS = 365;
const READ_DAYS = 29;

async function importNow(queryClient: QueryClient): Promise<boolean> {
  if (!mayImport('steps')) return false;
  const userId = await signedInUser();
  const now = new Date();
  const firstRead = !stepsYearRead();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = await dailySteps(addDays(today, -(firstRead ? FIRST_READ_DAYS : READ_DAYS)));
  // Another user may have signed in while the store was read, which lets go of the connection.
  if (!(await stillImporting('steps', userId))) return false;
  let changed = false;
  if (days.length) {
    const { data, error } = await supabase.rpc('import_steps', { days, today: toIsoDate(now) });
    if (error) throw error;
    changed = (data ?? 0) > 0;
  }
  if (firstRead) setStepsYearRead(true);
  if (changed) await queryClient.invalidateQueries({ queryKey: STEPS_KEY });
  return changed;
}

/** Reads the store's steps of each day and keeps them; whether any day changed. */
export const importHealthSteps = oneAtATime(importNow);
