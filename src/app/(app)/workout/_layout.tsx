import { Stack } from 'expo-router';

import { TabErrorBoundary } from '@/components/error-screen';
import { useTheme } from '@/theme';

// In place of the tab when it fails as it draws; the tab bar stays.
export const ErrorBoundary = TabErrorBoundary;

// The list goes beneath a screen opened in the tab from elsewhere with the anchor, as openWorkout()
// and openLog() in src/workouts/open.ts do, so that back returns to it.
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
