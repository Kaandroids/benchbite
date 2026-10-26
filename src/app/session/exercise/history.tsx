import { useLocalSearchParams } from 'expo-router';

import { ExerciseHistoryScreen } from '@/history/exercise-history-screen';

/** An exercise's records and progress, opened from the workout in progress. */
export default function SessionExerciseHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseHistoryScreen id={id} opensLogs={false} />;
}
