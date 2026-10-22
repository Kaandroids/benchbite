import { useLocalSearchParams } from 'expo-router';

import { ExerciseScreen } from '@/exercises/exercise-screen';

export default function ExerciseDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseScreen id={id} />;
}
