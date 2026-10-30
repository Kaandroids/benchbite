import type { LoggedEstimate } from './entries';
import type { Meal } from './meals';

/** A meal logged from photos, with what the toast that offers to undo it says. */
export type HandedEstimate = LoggedEstimate & { meal: Meal; count: number; calories: number };

// The meal logged last from photos, which the add screen of its meal and day shows as added and
// offers to undo. The photo screen is a screen of its own, so it hands the meal back this way.
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
