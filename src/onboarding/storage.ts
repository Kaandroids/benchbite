// The onboarding's state on the device: the draft of an unfinished onboarding, and whether it was
// finished. Both are stored per user, so a new guest account never sees another user's answers,
// and read synchronously, so the app can choose its first screen without waiting.
//
// Storage errors are logged and treated as "nothing stored": the worst case is going through the
// onboarding again, which is better than an app that crashes on launch.
import { Storage } from 'expo-sqlite/kv-store';

import { readItem, writeItem } from '@/lib/device-storage';

import { isStep, type Step } from './steps';
import type { OnboardingAnswers } from './types';

const PREFIX = 'onboarding.';
/** Raised when the answers change shape, so that an older draft is discarded instead of misread. */
const DRAFT_VERSION = 1;

export type Draft = { step: Step; answers: OnboardingAnswers };

const draftKey = (userId: string) => `${PREFIX}${userId}.draft`;
const completedKey = (userId: string) => `${PREFIX}${userId}.completed`;

export function loadDraft(userId: string): Draft | null {
  const stored = readItem(draftKey(userId));
  if (!stored) {
    return null;
  }
  try {
    const draft = JSON.parse(stored) as { version?: number; step?: string; answers?: unknown };
    if (draft.version !== DRAFT_VERSION || !draft.step || !isStep(draft.step)) {
      return null;
    }
    return { step: draft.step, answers: (draft.answers ?? {}) as OnboardingAnswers };
  } catch {
    // A damaged draft only costs the user their unfinished answers.
    return null;
  }
}

export function saveDraft(userId: string, draft: Draft) {
  writeItem(draftKey(userId), JSON.stringify({ version: DRAFT_VERSION, ...draft }));
}

export function clearDraft(userId: string) {
  writeItem(draftKey(userId), null);
}

export function loadCompleted(userId: string): boolean {
  return readItem(completedKey(userId)) === 'true';
}

export function saveCompleted(userId: string, completed: boolean) {
  writeItem(completedKey(userId), completed ? 'true' : null);
}

/**
 * Removes what other users left on this device, such as the draft of a guest account that was
 * replaced. Drafts hold health data, so they should not outlive their account.
 */
export function forgetOtherUsers(userId: string) {
  try {
    for (const key of Storage.getAllKeysSync()) {
      if (key.startsWith(PREFIX) && !key.startsWith(`${PREFIX}${userId}.`)) {
        Storage.removeItemSync(key);
      }
    }
  } catch (error) {
    console.warn('Could not remove the onboarding data of other users', error);
  }
}
