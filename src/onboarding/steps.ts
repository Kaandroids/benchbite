import { changesWeight } from '@/body/body';

import type { OnboardingAnswers } from './types';

/** Every step of the onboarding in order. Each one is a route in src/app/onboarding/. */
export const STEPS = [
  'welcome',
  'nickname',
  'goal',
  'goal-insight',
  'consent',
  'sex',
  'birth-year',
  'height',
  'weight',
  'target-weight',
  'pace',
  'activity',
  'training-intro',
  'experience',
  'training-days',
  'setup',
  'session-length',
  'building',
  'plan',
  'reminders',
  'summary',
] as const;

export type Step = (typeof STEPS)[number];

/** Whether the step is part of the flow for these answers. */
export function isIncluded(step: Step, answers: OnboardingAnswers): boolean {
  if (step === 'target-weight' || step === 'pace') {
    return changesWeight(answers.goal);
  }
  return true;
}

/** The steps of the flow for these answers between two steps, not counting either. */
export function stepsBetween(from: Step, to: Step, answers: OnboardingAnswers): Step[] {
  return STEPS.slice(STEPS.indexOf(from) + 1, STEPS.indexOf(to)).filter((step) =>
    isIncluded(step, answers),
  );
}

/** The answers each conditional step collects. */
const ANSWERS_OF: Partial<Record<Step, (keyof OnboardingAnswers)[]>> = {
  'target-weight': ['targetWeightKg'],
  pace: ['weeklyPaceKg'],
};

/**
 * Drops the answers of steps that are no longer part of the flow, such as a target weight after
 * the goal changed to staying healthy, so they are never saved.
 */
export function pruneAnswers(answers: OnboardingAnswers): OnboardingAnswers {
  const pruned = { ...answers };
  for (const [step, fields] of Object.entries(ANSWERS_OF) as [
    Step,
    (keyof OnboardingAnswers)[],
  ][]) {
    if (!isIncluded(step, pruned)) {
      for (const field of fields) {
        delete pruned[field];
      }
    }
  }
  return pruned;
}

/** The next step for these answers, or null after the last one. */
export function nextStep(step: Step, answers: OnboardingAnswers): Step | null {
  for (let index = STEPS.indexOf(step) + 1; index < STEPS.length; index++) {
    const candidate = STEPS[index]!;
    if (isIncluded(candidate, answers)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Whether the step only does its work and moves on. It is replaced by the next step rather than
 * left in the history, and going back skips it, so it is not shown again with its work done.
 */
export function isPassing(step: Step): boolean {
  return step === 'building';
}

/**
 * Whether the user can go back from the step. The plan step saves the onboarding, and a saved
 * onboarding cannot be saved again, so the steps after it have no way back to change the answers.
 */
export function canGoBackFrom(step: Step): boolean {
  return STEPS.indexOf(step) <= STEPS.indexOf('plan');
}

/**
 * Whether the onboarding can be left for the welcome screen from the step: from the questions,
 * not while the plan is built or once it is shown, as it is saved from there.
 */
export function canCloseFrom(step: Step): boolean {
  return step !== 'welcome' && !isPassing(step) && STEPS.indexOf(step) < STEPS.indexOf('plan');
}

/** The step that going back opens, or null if there is none. */
export function previousStep(step: Step, answers: OnboardingAnswers): Step | null {
  if (!canGoBackFrom(step)) {
    return null;
  }
  for (let index = STEPS.indexOf(step) - 1; index >= 0; index--) {
    const candidate = STEPS[index]!;
    if (isIncluded(candidate, answers) && !isPassing(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** The parts of the onboarding the progress bar shows. `FIRST_STEP` marks where each begins. */
export const SECTIONS = ['you', 'training', 'plan'] as const;

export type Section = (typeof SECTIONS)[number];

const FIRST_STEP: Record<Section, Step> = {
  you: 'nickname',
  training: 'training-intro',
  plan: 'building',
};

/**
 * The section the step is in and how far into it, between 0 and 1, counting the step itself as
 * reached. The welcome comes before the first section. It is measured against every step,
 * including those that may be skipped, so a section never grows and skipping moves it further.
 */
export function progressOf(step: Step): { current: number; value: number; overall: number } {
  const index = STEPS.indexOf(step);
  const starts = SECTIONS.map((section) => STEPS.indexOf(FIRST_STEP[section]));
  const current = Math.max(
    0,
    starts.findLastIndex((start) => start <= index),
  );
  const start = starts[current]!;
  const end = starts[current + 1] ?? STEPS.length;
  return {
    current,
    value: Math.max(0, index - start + 1) / (end - start),
    overall: index / (STEPS.length - 1),
  };
}

export function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}
