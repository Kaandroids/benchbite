import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/** The onboarding's steps slide in from the side, one question per screen. */
export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        // Replacing is only used to go back after resuming, so it slides the other way.
        animationTypeForReplace: 'pop',
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
