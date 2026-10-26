// The answers sent to the server, without the client, so screens and tests can use them alone.
import type { OnboardingAnswers } from './types';

/** Answers the result needs; the steps before guarantee them. */
export function required<K extends keyof OnboardingAnswers>(answers: OnboardingAnswers, key: K) {
  const value = answers[key];
  if (value === undefined) {
    throw new Error(`The onboarding answer ${key} is missing`);
  }
  return value as NonNullable<OnboardingAnswers[K]>;
}

/** The answers the plan builder takes, as generate-plan expects them. */
export function planRequest(answers: OnboardingAnswers) {
  return {
    goal: required(answers, 'goal'),
    experience: required(answers, 'experience'),
    trainingDays: required(answers, 'trainingDays'),
    setup: required(answers, 'setup'),
    sessionMinutes: required(answers, 'sessionMinutes'),
  };
}
