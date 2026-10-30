// What the add screen and the photo screen hand each other (ADR 0060). The photo screen is a
// screen of its own, and neither the photos nor what was logged belong in its route: a link could
// otherwise start an estimate of any address at the user's cost, or show a meal as logged. So
// they are handed over here, in the app's memory, as the meal screen gets a removed entry back
// (removed-entry.ts).
import type { LoggedEstimate } from './entries';
import type { Meal } from './meals';

let photos: { key: string; uris: string[] } | null = null;

/**
 * Keeps the photos taken or chosen for the photo screen, which opens with the key this gives;
 * any photos kept before are replaced.
 */
export function handOverMealPhotos(uris: string[]): string {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  photos = { key, uris };
  return key;
}

/** The photos handed over with this key, or none for any other, such as a link's. */
export function mealPhotos(key: string | undefined): string[] {
  return photos !== null && photos.key === key ? photos.uris : [];
}

/** Forgets the photos of this key, once the photo screen closes. */
export function releaseMealPhotos(key: string | undefined) {
  if (photos?.key === key) {
    photos = null;
  }
}

/** A meal logged from photos, with the meal it went to, as the add screen shows it. */
export type HandedEstimate = LoggedEstimate & { meal: Meal };

let logged: HandedEstimate | null = null;

export function handOverLoggedEstimate(estimate: HandedEstimate) {
  logged = estimate;
}

/** The meal logged from photos for this meal and day since its screen last asked, once. */
export function takeLoggedEstimate(meal: Meal, day: string): HandedEstimate | null {
  if (logged?.meal !== meal || logged.day !== day) {
    return null;
  }
  const estimate = logged;
  logged = null;
  return estimate;
}
