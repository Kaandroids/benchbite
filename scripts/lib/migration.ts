// Helpers for the scripts that write migrations from data files.
import { join } from 'node:path';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

/** A SQL string literal, or null. */
export function sqlString(value: string | null): string {
  return value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

/** A migration timestamp in the Supabase CLI's format, such as 20261027120000. */
export function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
