import { useLocalSearchParams } from 'expo-router';

import { ExerciseHistoryScreen } from '@/history/exercise-history-screen';

/** An exercise's records, progress and sets in every workout it was done in. */
export default function ExerciseHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseHistoryScreen id={id} />;
}
