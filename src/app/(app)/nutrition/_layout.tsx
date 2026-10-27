import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

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
