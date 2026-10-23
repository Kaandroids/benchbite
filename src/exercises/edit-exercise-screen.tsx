import { router } from 'expo-router';

import { allLoaded, LoadState } from '@/components/load-state';
import { Screen } from '@/components/ui/screen';

import { CreateExerciseScreen } from './create-exercise-screen';
import { formOf, useIsLogged } from './custom';
import { useExerciseDetails } from './library';

/** Edits the user's own exercise, filled in with what it has. */
export function EditExerciseScreen({ id }: { id: string }) {
  const { library, instructions } = useExerciseDetails(id);
  const logged = useIsLogged(id);
  const exercise = library.data?.find((item) => item.id === id);

  if (!allLoaded([library, instructions, logged]) || !exercise) {
    return (
      <Screen onBack={() => router.back()} closes>
        <LoadState queries={[library, instructions, logged]} />
      </Screen>
    );
  }
  return (
    <CreateExerciseScreen
      editing={{
        id,
        form: formOf(exercise, instructions.data ?? []),
        logged: logged.data ?? true,
      }}
    />
  );
}
