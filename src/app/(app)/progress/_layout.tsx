import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** The Progress tab: the cards, and the records they open. */
export default function ProgressLayout() {
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
