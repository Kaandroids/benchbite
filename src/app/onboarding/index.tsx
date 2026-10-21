import { Redirect } from 'expo-router';

import { useOnboarding } from '@/providers/onboarding-provider';

/** Opens the step the user was on, so an interrupted onboarding resumes there. */
export default function OnboardingIndex() {
  const { draft } = useOnboarding();
  return <Redirect href={{ pathname: '/onboarding/[step]', params: { step: draft.step } }} />;
}
