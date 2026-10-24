// Whether workout reminders are on and at what time, kept on the device (ADR 0029). The reminders
// themselves are scheduled a few weeks ahead and run out, so the time is kept apart from them to
// schedule them again. Storage errors are logged and read as reminders being off.
import { Storage } from 'expo-sqlite/kv-store';

const KEY = 'reminders.minutes';

/** The reminder time in minutes after midnight, or null when reminders are off. */
export function loadReminderMinutes(): number | null {
  try {
    const stored = Storage.getItemSync(KEY);
    const minutes = stored === null ? NaN : Number(stored);
    return Number.isInteger(minutes) && minutes >= 0 && minutes < 24 * 60 ? minutes : null;
  } catch (error) {
    console.warn('Could not read the reminder time', error);
    return null;
  }
}

/** Keeps the reminder time, or turns reminders off with null. */
export function saveReminderMinutes(minutes: number | null) {
  try {
    if (minutes === null) {
      Storage.removeItemSync(KEY);
    } else {
      Storage.setItemSync(KEY, String(minutes));
    }
  } catch (error) {
    console.warn('Could not save the reminder time', error);
  }
}
