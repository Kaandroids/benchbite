// What every import from the health store keeps to: it reads only while the store is connected and
// the kind is read, sends nothing for an account signed in while it read, and runs once at a time.
import { addDays } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

import { isHealthConnected, readSync, type HealthRead } from './connection';

/** The user whose data is imported now. */
export async function signedInUser(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id;
}

/** Whether the store is connected and a kind is read from it. */
export const mayImport = (kind: HealthRead) => isHealthConnected() && readSync(kind) === 'on';

/** Whether a kind may be read now, for the user signed in when the import started. */
export async function stillImporting(
  kind: HealthRead,
  userId: string | undefined,
): Promise<boolean> {
  return userId !== undefined && mayImport(kind) && (await signedInUser()) === userId;
}

/** Runs an import once at a time: a second caller waits for the one running. */
export function oneAtATime<Args extends unknown[]>(
  run: (...args: Args) => Promise<boolean>,
): (...args: Args) => Promise<boolean> {
  let running: Promise<boolean> | null = null;
  return (...args) => {
    running ??= run(...args).finally(() => {
      running = null;
    });
    return running;
  };
}

/** The start of the last `count` days by the phone's calendar, today one of them. */
export function lastDays(count: number, now = new Date()): Date {
  return addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1 - count);
}
