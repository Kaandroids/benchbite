import { useLocalSearchParams } from 'expo-router';

import { EditExerciseScreen } from '@/exercises/edit-exercise-screen';

/** Edits the user's own exercise. */
export default function EditExercise() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditExerciseScreen id={id} />;
}
