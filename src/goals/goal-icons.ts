import type { Goal } from '@/body/body';
import type { IconName } from '@/components/ui/icon';
import type { ColorTokens } from '@/theme';

/** The icon of each goal, on the goal cards. */
export const GOAL_ICONS: Record<Goal, IconName> = {
  lose_fat: 'flame',
  build_muscle: 'dumbbell',
  get_stronger: 'bolt',
  stay_healthy: 'heart',
};

/** Each goal's colours, those of the meals, so that the goals read apart. */
export const GOAL_COLORS: Record<
  Goal,
  { color: keyof ColorTokens; background: keyof ColorTokens }
> = {
  lose_fat: { color: 'lunch', background: 'lunchBackground' },
  build_muscle: { color: 'dinner', background: 'dinnerBackground' },
  get_stronger: { color: 'breakfast', background: 'breakfastBackground' },
  stay_healthy: { color: 'snack', background: 'snackBackground' },
};
