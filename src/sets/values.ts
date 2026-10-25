import type { SetField, SetKind } from './fields';

/** What a set records; a value the exercise does not record stays null. */
export type SetValues = {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
};

/** The most sets an exercise can have in a log (logged_sets.set_position). */
export const MAX_SETS = 20;

/** A set with nothing filled in yet. */
export const EMPTY_SET: SetValues = { weightKg: null, reps: null, seconds: null, meters: null };

/** The values a set still needs before it can be saved, as its exercise records them. */
export function missingFields(set: SetValues, kind: SetKind): SetField[] {
  if (kind.fields.includes('reps')) {
    return [
      ...(set.weightKg === null && !kind.addedWeight ? (['weightKg'] as const) : []),
      ...(set.reps === null ? (['reps'] as const) : []),
    ];
  }
  // A time or a distance, whichever the exercise records.
  return set.seconds === null && set.meters === null ? kind.fields : [];
}
