import type { IconName } from '@/components/ui/icon';

import type { OnboardingAnswers } from './types';

/** The icon of each goal, on the goal cards. */
export const GOAL_ICONS: Record<NonNullable<OnboardingAnswers['goal']>, IconName> = {
  lose_fat: 'flame',
  build_muscle: 'dumbbell',
  get_stronger: 'bolt',
  stay_healthy: 'heart',
};
