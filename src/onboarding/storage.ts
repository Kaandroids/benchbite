// The onboarding's state on the device: the draft of an unfinished onboarding, and whether it was
// finished. Both are read synchronously, so the app can choose its first screen without waiting.
import { Storage } from 'expo-sqlite/kv-store';

import { isStep, type Step } from './steps';
import type { OnboardingAnswers } from './types';

const DRAFT_KEY = 'onboarding.draft';
const COMPLETED_KEY = 'onboarding.completed';
/** Raised when the answers change shape, so that an older draft is discarded instead of misread. */
const DRAFT_VERSION = 1;

export type Draft = { step: Step; answers: OnboardingAnswers };

export function loadDraft(): Draft | null {
  try {
    const stored = Storage.getItemSync(DRAFT_KEY);
    if (!stored) {
      return null;
    }
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

export function saveDraft(draft: Draft) {
  Storage.setItemSync(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, ...draft }));
}

export function clearDraft() {
  Storage.removeItemSync(DRAFT_KEY);
}

export function loadCompleted(): boolean {
  return Storage.getItemSync(COMPLETED_KEY) === 'true';
}

export function saveCompleted(completed: boolean) {
  if (completed) {
    Storage.setItemSync(COMPLETED_KEY, 'true');
  } else {
    Storage.removeItemSync(COMPLETED_KEY);
  }
}
