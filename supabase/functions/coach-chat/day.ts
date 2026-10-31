// The user's days, as their device names them: YYYY-MM-DD.
import { z } from 'zod';

/** A day, YYYY-MM-DD, that exists. */
export const DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const date = new Date(`${day}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().startsWith(day);
  }, 'Not a day');

/** A time of day, HH:MM, as the user's device has it. */
export const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}
