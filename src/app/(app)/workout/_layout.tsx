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
    >
      {/* Its own buttons say where back goes, as the list would only open it again. */}
      <Stack.Screen name="choose" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
