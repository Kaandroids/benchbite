import { useLocalSearchParams } from 'expo-router';

import { SectionErrorBoundary } from '@/components/error-screen';
import { ExerciseHistoryScreen } from '@/history/exercise-history-screen';

// In place of the screen when it fails as it draws, with the way to Today (ADR 0150).
export const ErrorBoundary = SectionErrorBoundary;

/** An exercise's records and progress, opened from the workout in progress. */
export default function SessionExerciseHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseHistoryScreen id={id} opensLogs={false} />;
}
