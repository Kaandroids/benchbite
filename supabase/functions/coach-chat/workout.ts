// How Bite names a workout, in the snapshot and in what its tools return.

/** An alternative's name, or as the app calls one without a name, by its place (ADR 0061). */
export function alternativeName(alternative: { name: string | null; position: number }): string {
  return alternative.name || `Alternative ${alternative.position}`;
}

/** A workout's name, or for one without a name its type in words, as `full body`. */
export function workoutName(workout: { name: string | null; type: string | null }): string {
  return workout.name || (workout.type ?? 'workout').replaceAll('_', ' ');
}
