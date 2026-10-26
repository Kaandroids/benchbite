import { useLocalSearchParams } from 'expo-router';

import { ExerciseScreen } from '@/exercises/exercise-screen';

/** How to do an exercise, opened from the workout in progress. */
export default function SessionExerciseDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseScreen id={id} canEdit={false} />;
}
