// The Supabase client as the Edge Functions use it, with the generated database types.
import type { SupabaseContext } from '@supabase/server';

import type { Database } from './database.types.ts';

export type Client = SupabaseContext<Database>['supabase'];

/**
 * Logs a failed database call by its code and message only: the details of some errors repeat
 * the row, which can hold the user's health data.
 */
export function logError(what: string, error: unknown): void {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  console.error(what, { code, message: message ?? String(error) });
}
