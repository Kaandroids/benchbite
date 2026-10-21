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
/** Long enough for a choice card's pop to show before the next step slides in. */
const CHOICE_DELAY_MS = 250;

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

  /** Saves the answers of this step and opens the next one, or finishes after the last. */
  const next = (answers: OnboardingAnswers = {}) => {
    if (leaving.current) {
      return;
    }
    leaving.current = true;
    answer(answers);
    const following = nextStep(step, { ...draft.answers, ...answers });
    if (following) {
      // Recorded before the screen opens, so the step route knows the user reached it.
      setStep(following);
      router.push({ pathname: '/onboarding/[step]', params: { step: following } });
    } else {
      complete();
    }
  };

  return {
    answers: draft.answers,
    progress: progressOf(step),
    next,
    back: previous ? back : undefined,
    /**
     * For single-choice steps: selects the answer right away, so its card can pop, then moves on
     * without a Continue button.
     */
    choose: (answers: OnboardingAnswers) => {
      answer(answers);
      setTimeout(() => next(answers), CHOICE_DELAY_MS);
    },
  };
}
