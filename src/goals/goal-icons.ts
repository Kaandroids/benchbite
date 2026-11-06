import type { Goal } from '@/body/body';
import type { IconName } from '@/components/ui/icon';
import type { Tone } from '@/theme';

/** The icon of each goal, on the goal cards. */
export const GOAL_ICONS: Record<Goal, IconName> = {
  lose_fat: 'flame',
  build_muscle: 'dumbbell',
  get_stronger: 'bolt',
  stay_healthy: 'heart',
};

/** Each goal's colours, so that the goals read apart. */
export const GOAL_TONES: Record<Goal, Tone> = {
  lose_fat: 'lunch',
  build_muscle: 'dinner',
  get_stronger: 'breakfast',
  stay_healthy: 'snack',
};
