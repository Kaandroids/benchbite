// How Bite names a workout, in the snapshot and in what its tools return.

/** A workout's name, or for one without a name its type in words, as `full body`. */
export function workoutName(workout: { name: string | null; type: string | null }): string {
  return workout.name || (workout.type ?? 'workout').replaceAll('_', ' ');
}
