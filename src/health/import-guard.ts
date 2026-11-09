// What every import from the health store keeps to: it reads only while the store is connected and
// the kind is read, sends nothing for an account signed in while it read, runs once at a time, and
// reads from the day last read on.
// Saving workouts to the store (ADR 0105) runs once at a time too, with oneAtATimeThenAgain.
import { fromIsoDate, lastDays } from '@/i18n/dates';
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

/**
 * Runs a job once at a time, as oneAtATime, but a caller that comes while it runs gets a run after
 * it, as what it asks for may have changed meanwhile. Callers during one run share the next.
 */
export function oneAtATimeThenAgain(run: () => Promise<boolean>): () => Promise<boolean> {
  let running: Promise<boolean> | null = null;
  let next: Promise<boolean> | null = null;
  const start = () => {
    const current = run().finally(() => {
      running = null;
    });
    running = current;
    return current;
  };
  return () => {
    if (!running) return start();
    next ??= running
      .catch(() => false)
      .then(() => {
        next = null;
        return start();
      });
    return next;
  };
}

/** How many days, today among them, a read goes back at most. */
export const MOST_DAYS = 366;
/** How many days a read goes back at least, for a watch or an app that syncs late. */
export const LEAST_DAYS = 30;

/**
 * Where a read starts: `firstDays` back the first time, then the day last read on, YYYY-MM-DD, or
 * 30 days back if later; a year back at most.
 */
export function readFrom(lastReadOn: string | null, firstDays: number, now: Date): Date {
  const least = lastDays(LEAST_DAYS, now);
  const most = lastDays(MOST_DAYS, now);
  if (lastReadOn === null) return lastDays(firstDays, now);
  const from = fromIsoDate(lastReadOn);
  return from > least ? least : from < most ? most : from;
}
