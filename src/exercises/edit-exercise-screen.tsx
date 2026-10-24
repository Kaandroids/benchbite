import { router } from 'expo-router';

import { allLoaded, LoadState } from '@/components/load-state';
import { Screen } from '@/components/ui/screen';

import { CreateExerciseScreen } from './create-exercise-screen';
import { formOf, useKindLock } from './custom';
import { ExerciseNotFound } from './exercise-not-found';
import { useExerciseDetails, findExercise } from './library';

/** Edits the user's own exercise, filled in with what it has. */
export function EditExerciseScreen({ id }: { id: string }) {
  const { library, instructions } = useExerciseDetails(id);
  const kindLock = useKindLock(id);
  const exercise = findExercise(library.data, id);

  if (!allLoaded([library, instructions, kindLock])) {
    return (
      <Screen onBack={() => router.back()} closes>
        <LoadState queries={[library, instructions, kindLock]} />
      </Screen>
    );
  }
  // Only the user's own exercises can be edited.
  if (!exercise?.custom) {
    return (
      <Screen onBack={() => router.back()} closes>
        <ExerciseNotFound />
      </Screen>
    );
  }
  return (
    <CreateExerciseScreen
      editing={{
        id,
        form: formOf(exercise, instructions.data ?? []),
        kindLock: kindLock.data ?? 'logged',
      }}
    />
  );
}
