import type { Goal } from '@/body/body';
import type { IconName } from '@/components/ui/icon';

/** The icon of each goal, on the goal cards. */
export const GOAL_ICONS: Record<Goal, IconName> = {
  lose_fat: 'flame',
  build_muscle: 'dumbbell',
  get_stronger: 'bolt',
  stay_healthy: 'heart',
};
