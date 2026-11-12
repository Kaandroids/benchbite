import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

// A screen opened in the tab from elsewhere, as a log from Today, has the list beneath it, so that
// back, and a log deleted there, go to the list rather than out of the tab, leaving it on that screen.
export const unstable_settings = { anchor: 'index' };

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
