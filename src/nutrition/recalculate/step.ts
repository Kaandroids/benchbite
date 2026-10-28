import { router } from 'expo-router';

import type { WeightUnit } from '@/i18n/units';

import type { TargetAnswers, TargetBasis } from '../targets';

/** What each step's screen gets: the answers so far, what they start from, and moving on. */
export type StepProps = {
  answers: TargetAnswers;
  basis: TargetBasis;
  weightKg: number;
  unit: WeightUnit;
  /** The progress through the steps, for the top bar. */
  progress: { sections: string[]; current: number; value: number; overall: number };
  /** Opens the next step with the answers so far. */
  next: (answers: TargetAnswers) => void;
};

/** Leaves the steps for the daily goals, from any of them. */
export const leave = () => router.dismissTo('/nutrition/goals');
