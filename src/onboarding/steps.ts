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

/** Only goals that change the weight ask for a target weight and a pace. */
function changesWeight(answers: OnboardingAnswers): boolean {
  return answers.goal === 'lose_fat' || answers.goal === 'build_muscle';
}

/** Whether the step is part of the flow for these answers. */
export function isIncluded(step: Step, answers: OnboardingAnswers): boolean {
  if (step === 'target-weight' || step === 'pace') {
    return changesWeight(answers);
  }
  return true;
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

/**
 * How far the user is, between 0 and 1. It is measured against every step, including those that
 * may be skipped, so the total never grows and skipping a step moves the bar further.
 */
export function progressOf(step: Step): number {
  return STEPS.indexOf(step) / (STEPS.length - 1);
}

export function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}
