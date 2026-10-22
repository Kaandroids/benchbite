import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';

import { useOnboarding } from '@/providers/onboarding-provider';

import { canGoBackFrom, isPassing, nextStep, previousStep, progressOf, type Step } from './steps';
import type { OnboardingAnswers } from './types';

/** Long enough for a choice card's pop to show before the next step slides in. */
const CHOICE_DELAY_MS = 250;

/**
 * What a step's screen needs: its answers so far, the progress, and moving on or back. The step
 * is recorded whenever its screen is focused, including after a back swipe, so the onboarding
 * resumes on the screen that was last shown.
 */
export function useStep(step: Step) {
  const { draft, setStep, answer, complete } = useOnboarding();
  // Set while the next step opens, so a quick second tap does not open it twice.
  const leaving = useRef(false);
  // The move to the next step after a choice, until it happens.
  const choice = useRef<ReturnType<typeof setTimeout>>(undefined);

  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      setStep(step);
      // A choice made just before leaving the screen backwards does not move on afterwards.
      return () => clearTimeout(choice.current);
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
  // leave the app. It opens the previous step instead, and does nothing where there is no way
  // back.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!canGoBackFrom(step)) {
          return true;
        }
        if (router.canGoBack() || !previous) {
          return false;
        }
        back();
        return true;
      });
      return () => subscription.remove();
    }, [back, previous, step]),
  );

  /** Saves the answers and opens the next step, or finishes after the last. */
  const moveOn = (answers: OnboardingAnswers) => {
    answer(answers);
    const following = nextStep(step, { ...draft.answers, ...answers });
    if (!following) {
      complete();
      return;
    }
    // Recorded before the screen opens, so the step route knows the user reached it.
    setStep(following);
    const href = { pathname: '/onboarding/[step]', params: { step: following } } as const;
    if (isPassing(step)) {
      router.replace(href);
    } else {
      router.push(href);
    }
  };

  /** Saves the answers of this step and opens the next one, or finishes after the last. */
  const next = (answers: OnboardingAnswers = {}) => {
    if (leaving.current) {
      return;
    }
    leaving.current = true;
    moveOn(answers);
  };

  return {
    answers: draft.answers,
    progress: progressOf(step),
    /** Saves answers without moving on, for example to withdraw one. */
    answer,
    next,
    back: previous ? back : undefined,
    /**
     * For single-choice steps: selects the answer right away, so its card can pop, then moves on
     * without a Continue button. Further choices are ignored until the next step opens.
     */
    choose: (answers: OnboardingAnswers) => {
      if (leaving.current) {
        return;
      }
      leaving.current = true;
      answer(answers);
      choice.current = setTimeout(() => moveOn(answers), CHOICE_DELAY_MS);
    },
  };
}
