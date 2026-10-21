import { Redirect, useLocalSearchParams } from 'expo-router';

import { STEP_SCREENS } from '@/onboarding/screens';
import { isIncluded, isStep, STEPS } from '@/onboarding/steps';
import { useOnboarding } from '@/providers/onboarding-provider';

/**
 * Shows the screen of one onboarding step. Only steps the user has reached can be opened, so a
 * link cannot skip the consent or leave answers out; anything else opens the current step.
 */
export default function OnboardingStep() {
  const { step } = useLocalSearchParams<{ step: string }>();
  const { draft } = useOnboarding();
  if (
    !isStep(step) ||
    !isIncluded(step, draft.answers) ||
    STEPS.indexOf(step) > STEPS.indexOf(draft.step)
  ) {
    return <Redirect href="/onboarding" />;
  }
  const StepScreen = STEP_SCREENS[step];
  return <StepScreen />;
}
