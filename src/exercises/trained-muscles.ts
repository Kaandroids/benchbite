import { trainedMuscles } from './body-map';
import { findExercise, useExerciseLibrary } from './library';

/**
 * Gives the muscles the exercises with the given ids train together, from the library (#304);
 * none while the library loads.
 */
export function useTrainedMuscles() {
  const library = useExerciseLibrary();
  return (exerciseIds: readonly string[]) =>
    trainedMuscles(exerciseIds.map((id) => findExercise(library.data, id)));
}
