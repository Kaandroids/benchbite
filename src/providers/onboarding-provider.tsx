import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import {
  clearDraft,
  forgetOtherUsers,
  loadCompleted,
  loadDraft,
  saveCompleted,
  saveDraft,
  type Draft,
} from '@/onboarding/storage';
import type { Step } from '@/onboarding/steps';
import type { OnboardingAnswers } from '@/onboarding/types';

import { useSession } from './session-provider';

type OnboardingContextValue = {
  /** Whether the onboarding was finished. The app's screens are only available then. */
  completed: boolean;
  /** The step the user is on and the answers so far. */
  draft: Draft;
  /** Records the step on screen, so that the onboarding resumes there. */
  setStep: (step: Step) => void;
  /** Merges answers into the draft. */
  answer: (answers: OnboardingAnswers) => void;
  /** Marks the onboarding as finished and discards the draft. */
  complete: () => void;
  /** Starts the onboarding again, for development. */
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const EMPTY_DRAFT: Draft = { step: 'welcome', answers: {} };

/** Used until the session is ready; the app shows nothing before that. */
const LOADING: OnboardingContextValue = {
  completed: false,
  draft: EMPTY_DRAFT,
  setStep: () => {},
  answer: () => {},
  complete: () => {},
  reset: () => {},
};

/**
 * Holds the onboarding's state of the signed-in user and keeps it on the device after every
 * change. When the user changes, for example because a new guest account replaced an expired
 * one, the state is loaded again for the new user.
 */
export function OnboardingProvider({ children }: PropsWithChildren) {
  const sessionState = useSession();
  const userId = sessionState.status === 'ready' ? sessionState.session.user.id : null;

  if (!userId) {
    return <OnboardingContext value={LOADING}>{children}</OnboardingContext>;
  }
  return (
    <UserOnboardingProvider key={userId} userId={userId}>
      {children}
    </UserOnboardingProvider>
  );
}

/**
 * The server decides whether the onboarding was finished; the copy on the device answers
 * immediately and while offline.
 */
function UserOnboardingProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const [completed, setCompleted] = useState(() => {
    forgetOtherUsers(userId);
    return loadCompleted(userId);
  });
  const [draft, setDraft] = useState(() => loadDraft(userId) ?? EMPTY_DRAFT);

  // Someone who finished the onboarding on another device, after signing in to their account,
  // skips it here too. The server is asked once per user, and again whenever the app returns to
  // the foreground until it answers, so starting offline only delays the check. The answer can
  // only finish the onboarding, never undo it, so restarting it from the gallery sticks.
  useEffect(() => {
    let answered = false;
    const check = async () => {
      if (answered) {
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error || answered) {
        return;
      }
      answered = true;
      if (data?.onboarding_completed_at) {
        saveCompleted(userId, true);
        setCompleted(true);
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check();
      }
    });
    return () => {
      answered = true;
      subscription.remove();
    };
  }, [userId]);

  // Builds on the latest draft, so that answering and moving on in one handler both count. A
  // draft that did not change is neither saved nor rendered again. Once the onboarding is
  // finished, the last step may still be on screen and record itself; that is ignored, so the
  // discarded draft is not written back.
  const update = (change: (current: Draft) => Draft) => {
    if (completed) {
      return;
    }
    setDraft((current) => {
      const next = change(current);
      if (next !== current) {
        saveDraft(userId, next);
      }
      return next;
    });
  };

  const value: OnboardingContextValue = {
    completed,
    draft,
    // Returning the same draft for the same step lets React skip the render.
    setStep: (step) =>
      update((current) => (current.step === step ? current : { ...current, step })),
    answer: (answers) =>
      update((current) => ({ ...current, answers: { ...current.answers, ...answers } })),
    complete: () => {
      saveCompleted(userId, true);
      clearDraft(userId);
      setDraft(EMPTY_DRAFT);
      setCompleted(true);
    },
    reset: () => {
      saveCompleted(userId, false);
      clearDraft(userId);
      setDraft(EMPTY_DRAFT);
      setCompleted(false);
    },
  };

  return <OnboardingContext value={value}>{children}</OnboardingContext>;
}

export function useOnboarding(): OnboardingContextValue {
  const value = use(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used inside an OnboardingProvider');
  }
  return value;
}
