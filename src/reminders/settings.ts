// Whether workout reminders are on and at what time, kept on the device (ADR 0029). The reminders
// themselves are scheduled a few weeks ahead and run out, so the time is kept apart from them to
// schedule them again. A time that cannot be read counts as reminders being off.
import { readItem, writeItem } from '@/lib/device-storage';

const KEY = 'reminders.minutes';

/** The reminder time in minutes after midnight, or null when reminders are off. */
export function loadReminderMinutes(): number | null {
  const stored = readItem(KEY);
  const minutes = stored === null ? NaN : Number(stored);
  return Number.isInteger(minutes) && minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

/** Keeps the reminder time, or turns reminders off with null. */
export function saveReminderMinutes(minutes: number | null) {
  writeItem(KEY, minutes === null ? null : String(minutes));
}
