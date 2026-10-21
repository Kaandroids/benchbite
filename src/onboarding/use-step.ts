import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';

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
  // Set while the next step opens, so a quick second tap does not open it twice.
  const leaving = useRef(false);

  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      setStep(step);
    }, [setStep, step]),
  );

  const previous = previousStep(step, draft.answers);

  /** Goes back, also after resuming, when the previous step is not in the history. */
  const back = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else if (previous) {
      router.replace({ pathname: '/onboarding/[step]', params: { step: previous } });
    }
  }, [previous]);

  // After resuming, the earlier steps are not in the history, so Android's back button would
  // leave the app. It opens the previous step instead.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack() || !previous) {
          return false;
        }
        back();
        return true;
      });
      return () => subscription.remove();
    }, [back, previous]),
  );

  return {
    answers: draft.answers,
    progress: progressOf(step),
    /** Saves the answers of this step and opens the next one, or finishes after the last. */
    next: (answers: OnboardingAnswers = {}) => {
      if (leaving.current) {
        return;
      }
      leaving.current = true;
      answer(answers);
      const next = nextStep(step, { ...draft.answers, ...answers });
      if (next) {
        // Recorded before the screen opens, so the step route knows the user reached it.
        setStep(next);
        router.push({ pathname: '/onboarding/[step]', params: { step: next } });
      } else {
        complete();
      }
    },
    back: previous ? back : undefined,
  };
}
