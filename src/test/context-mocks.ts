// Stand-ins for what useSession and useOnboarding return, for tests that mock those hooks:
//
//   jest.mocked(useSession).mockReturnValue(sessionValue('user-1'));
//
// They fill in what a test does not care about, so a new field on either context only changes
// this file.
import type { Session } from '@supabase/supabase-js';

import type { useOnboarding } from '@/providers/onboarding-provider';
import type { SessionState, useSession } from '@/providers/session-provider';

type SessionValue = ReturnType<typeof useSession>;
type OnboardingValue = ReturnType<typeof useOnboarding>;
type SessionOptions = Partial<Pick<SessionValue, 'retry' | 'startAgain' | 'signOut'>> & {
  /** Whether the signed-in user is a guest; they are unless this is false. */
  isAnonymous?: boolean;
};

/** The session of the signed-in user with the given id, or another state of the session. */
export function sessionValue(
  state: string | SessionState,
  { isAnonymous = true, ...functions }: SessionOptions = {},
): SessionValue {
  return {
    ...(typeof state === 'string'
      ? {
          status: 'ready' as const,
          session: { user: { id: state, is_anonymous: isAnonymous } } as Session,
        }
      : state),
    retry: jest.fn(),
    startAgain: jest.fn(),
    signOut: jest.fn(),
    ...functions,
  };
}

/** The onboarding at its first step, not finished, with the given changes. */
export function onboardingValue(changes: Partial<OnboardingValue> = {}): OnboardingValue {
  return {
    completed: false,
    checking: false,
    draft: { step: 'welcome', answers: {} },
    setStep: jest.fn(),
    answer: jest.fn(),
    complete: jest.fn(),
    reset: jest.fn(),
    ...changes,
  };
}
