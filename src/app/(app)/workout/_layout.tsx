import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** The Workout tab: the list of workouts, and the workouts and archive it opens. */
export default function WorkoutLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
