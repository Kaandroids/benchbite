// Rules for the training preference steps.
import type { OnboardingAnswers } from './types';

type Experience = NonNullable<OnboardingAnswers['experience']>;

/** Every plan keeps at least one rest day, which the database enforces too. */
export const MAX_TRAINING_DAYS = 6;

/**
 * Training days suggested for each level of experience, as ISO weekdays starting on Monday, with
 * rest days between them where the number of days allows.
 */
export const RECOMMENDED_DAYS: Record<Experience, number[]> = {
  beginner: [1, 3, 5],
  intermediate: [1, 2, 4, 5],
  advanced: [1, 2, 3, 5, 6],
};

export const SESSION_MINUTES = [30, 45, 60, 75] as const;
