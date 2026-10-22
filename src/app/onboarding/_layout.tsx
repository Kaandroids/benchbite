import { Stack } from 'expo-router';

import { canGoBackFrom, isPassing, isStep, STEPS } from '@/onboarding/steps';
import { useTheme } from '@/theme';

/** Whether the step replaces a passing step when it opens, which moves forwards. */
function followsPassingStep(step: string): boolean {
  const before = isStep(step) ? STEPS[STEPS.indexOf(step) - 1] : undefined;
  return before !== undefined && isPassing(before);
}

/** The onboarding's steps slide in from the side, one question per screen. */
export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="[step]"
        options={({ route }) => {
          const { step = '' } = (route.params ?? {}) as { step?: string };
          return {
            // Replacing goes back after resuming, so it slides the other way, unless the step
            // replaces a passing step on the way forwards.
            animationTypeForReplace: followsPassingStep(step) ? 'push' : 'pop',
            gestureEnabled: !isStep(step) || canGoBackFrom(step),
          };
        }}
      />
    </Stack>
  );
}
