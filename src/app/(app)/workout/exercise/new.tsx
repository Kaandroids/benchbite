import { useLocalSearchParams } from 'expo-router';

import { CreateExerciseScreen } from '@/exercises/create-exercise-screen';

/** Creates the user's own exercise, its name filled in when one is given. */
export default function NewExercise() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <CreateExerciseScreen name={name} />;
}
