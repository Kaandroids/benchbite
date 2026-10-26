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

/**
 * The runs of training days that follow each other, each from its first day to its last, such
 * as `[[1, 2], [4, 5]]`. Sunday is followed by Monday, so a run can wrap around the week.
 */
export function backToBackRuns(days: number[]): number[][] {
  const isTraining = (day: number) => days.includes(((day + 6) % 7) + 1);
  // A run starts on a training day whose day before is not one.
  const starts = days.filter((day) => !isTraining(day - 1));
  return starts.flatMap((start) => {
    const run = [start];
    while (run.length < days.length && isTraining(run.at(-1)! + 1)) {
      run.push((run.at(-1)! % 7) + 1);
    }
    return run.length > 1 ? [run] : [];
  });
}
