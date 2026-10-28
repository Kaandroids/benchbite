import { Redirect } from 'expo-router';

import { stepHref } from '@/onboarding/steps';
import { useOnboarding } from '@/providers/onboarding-provider';

/** Opens the step the user was on, so an interrupted onboarding resumes there. */
export default function OnboardingIndex() {
  const { draft } = useOnboarding();
  return <Redirect href={stepHref(draft.step)} />;
}
