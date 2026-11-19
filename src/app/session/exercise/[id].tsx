import { useLocalSearchParams } from 'expo-router';

import { SectionErrorBoundary } from '@/components/error-screen';
import { ExerciseScreen } from '@/exercises/exercise-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

/** How to do an exercise, opened from the workout in progress. */
export default function SessionExerciseDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseScreen id={id} canEdit={false} />;
}
