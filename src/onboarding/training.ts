// Rules for the training preference steps.
import type { OnboardingAnswers } from './types';

type Experience = NonNullable<OnboardingAnswers['experience']>;

export { MAX_TRAINING_DAYS, SESSION_MINUTES } from '@shared/plan/limits';

/**
 * Training days suggested for each level of experience, as ISO weekdays starting on Monday, with
 * rest days between them where the number of days allows.
 */
export const RECOMMENDED_DAYS: Record<Experience, number[]> = {
  beginner: [1, 3, 5],
  intermediate: [1, 2, 4, 5],
  advanced: [1, 2, 3, 5, 6],
};
