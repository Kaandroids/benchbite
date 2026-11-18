import { Stack } from 'expo-router';

import { SectionErrorBoundary } from '@/components/error-screen';
import { useTheme } from '@/theme';

// In place of the tab when it fails as it draws; the tab bar stays.
export const ErrorBoundary = SectionErrorBoundary;

/** The Nutrition tab: the day, and the screens that add a food to it. */
export default function NutritionLayout() {
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
