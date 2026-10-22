import { useLocalSearchParams } from 'expo-router';

import { WorkoutScreen } from '@/workouts/workout-screen';

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutScreen id={Number(id)} />;
}
