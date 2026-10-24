/** What a set records; a value the exercise does not record stays null. */
export type SetValues = {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
};

/** The most sets an exercise can have in a log (logged_sets.set_position). */
export const MAX_SETS = 20;
