import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler } from 'react-native';

import { useOnboarding } from '@/providers/onboarding-provider';

import {
  canCloseFrom,
  canGoBackFrom,
  isPassing,
  nextStep,
  previousStep,
  progressOf,
  SECTIONS,
  stepHref,
  type Step,
} from './steps';
import type { OnboardingAnswers } from './types';

/**
 * Goes back to an earlier step, leaving none of the steps after it to go back to. Every step is
 * the same route, so going back to one by its address would only change the screen on top: the
 * steps are closed down to the first, which becomes the step.
 */
export function returnTo(step: Step) {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace(stepHref(step));
}

/**
 * What a step's screen needs: its answers so far, the progress, and moving on or back. The step
 * is recorded whenever its screen is focused, including after a back swipe, so the onboarding
 * resumes on the screen that was last shown.
 */
export function useStep(step: Step) {
  const { t } = useTranslation();
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
      router.replace(stepHref(previous));
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
    const href = stepHref(following);
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

  const progress = {
    sections: SECTIONS.map((section) => t(`onboarding.sections.${section}`)),
    ...progressOf(step),
  };
  const close = canCloseFrom(step) ? () => returnTo('welcome') : undefined;

  return {
    answers: draft.answers,
    progress,
    /** Saves answers without moving on, for example to withdraw one. */
    answer,
    next,
    back: previous ? back : undefined,
    /**
     * Leaves the steps for the welcome screen, keeping the answers so far, so starting again finds
     * them. Only on the questions.
     */
    close,
    /** The top bar of the step's screen, to spread into it: the progress, back and the cross. */
    bar: { progress, onBack: previous ? back : undefined, onClose: close },
    /**
     * For a step's choice: saves the answer when it differs from the one saved, so tapping the
     * chosen card again does nothing. Continue then moves on.
     */
    select: (choice: OnboardingAnswers) => {
      const changed = (Object.keys(choice) as (keyof OnboardingAnswers)[]).some(
        (key) => choice[key] !== draft.answers[key],
      );
      if (changed) {
        answer(choice);
      }
    },
  };
}
