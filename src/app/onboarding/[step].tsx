import { Redirect, useLocalSearchParams } from 'expo-router';

import { STEP_SCREENS } from '@/onboarding/screens';
import { isStep } from '@/onboarding/steps';

/** Shows the screen of one onboarding step. */
export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  if (!isStep(step)) {
    return <Redirect href="/onboarding" />;
  }
  const StepScreen = STEP_SCREENS[step];
  return <StepScreen />;
}
