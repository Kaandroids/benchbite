import type { Database } from '@/lib/database.types';

import { findExercise, useExerciseLibrary } from './library';

type Muscle = Database['public']['Enums']['muscle'];

/**
 * The muscles a set of exercises trains together: those any of them trains first, then those that
 * only help. Unknown exercises, such as ones not loaded, count for nothing.
 */
export function trainedMuscles(
  exercises: readonly ({ primaryMuscles: Muscle[]; secondaryMuscles: Muscle[] } | undefined)[],
): { primary: Muscle[]; secondary: Muscle[] } {
  const primary = new Set<Muscle>();
  const secondary = new Set<Muscle>();
  for (const exercise of exercises) {
    exercise?.primaryMuscles.forEach((muscle) => primary.add(muscle));
    exercise?.secondaryMuscles.forEach((muscle) => secondary.add(muscle));
  }
  return {
    primary: [...primary],
    secondary: [...secondary].filter((muscle) => !primary.has(muscle)),
  };
}

/**
 * Gives the muscles the exercises with the given ids train together, from the library (#304);
 * none while the library loads.
 */
export function useTrainedMuscles() {
  const library = useExerciseLibrary();
  return (exerciseIds: readonly string[]) =>
    trainedMuscles(exerciseIds.map((id) => findExercise(library.data, id)));
}
