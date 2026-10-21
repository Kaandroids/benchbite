import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useOnboarding } from '@/providers/onboarding-provider';

import { nextStep, previousStep, progressOf, type Step } from './steps';
import type { OnboardingAnswers } from './types';

/**
 * What a step's screen needs: its answers so far, the progress, and moving on or back. The step
 * is recorded whenever its screen is focused, including after a back swipe, so the onboarding
 * resumes on the screen that was last shown.
 */
export function useStep(step: Step) {
  const { draft, setStep, answer, complete } = useOnboarding();

  useFocusEffect(useCallback(() => setStep(step), [setStep, step]));

  const previous = previousStep(step, draft.answers);

  return {
    answers: draft.answers,
    progress: progressOf(step),
    /** Saves the answers of this step and opens the next one, or finishes after the last. */
    next: (answers: OnboardingAnswers = {}) => {
      answer(answers);
      const next = nextStep(step, { ...draft.answers, ...answers });
      if (next) {
        router.push({ pathname: '/onboarding/[step]', params: { step: next } });
      } else {
        complete();
      }
    },
    /** Goes back, also after resuming, when the previous step is not in the history. */
    back: previous
      ? () => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace({ pathname: '/onboarding/[step]', params: { step: previous } });
          }
        }
      : undefined,
  };
}
