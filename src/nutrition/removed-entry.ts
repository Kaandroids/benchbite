import type { LoggedEntry, Meal } from './meals';

// The entry removed last on the entry screen, which the screen of its meal and day offers to
// undo when it shows again. The entry screen is a screen of its own, so it hands the entry back
// this way.
let removed: LoggedEntry | null = null;

export function handOverRemovedEntry(entry: LoggedEntry) {
  removed = entry;
}

/** The entry of this meal and day removed since its screen last asked, once. */
export function takeRemovedEntry(meal: Meal, day: string): LoggedEntry | null {
  if (removed?.meal !== meal || removed.day !== day) {
    return null;
  }
  const entry = removed;
  removed = null;
  return entry;
}
