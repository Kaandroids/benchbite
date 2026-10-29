import { useLocalSearchParams } from 'expo-router';

import { ExerciseHistoryScreen } from '@/history/exercise-history-screen';

/** An exercise's history, opened from one of its records; its workouts open from the Workout tab. */
export default function ProgressExerciseHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExerciseHistoryScreen id={id} opensLogs={false} />;
}
