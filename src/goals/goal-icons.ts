import type { Goal } from '@/body/body';
import type { IconName } from '@/components/ui/icon';
import { MEAL_COLORS } from '@/nutrition/meals';

/** The icon of each goal, on the goal cards. */
export const GOAL_ICONS: Record<Goal, IconName> = {
  lose_fat: 'flame',
  build_muscle: 'dumbbell',
  get_stronger: 'bolt',
  stay_healthy: 'heart',
};

/** Each goal's colours, those of the meals, so that the goals read apart. */
export const GOAL_COLORS: Record<Goal, (typeof MEAL_COLORS)[keyof typeof MEAL_COLORS]> = {
  lose_fat: MEAL_COLORS.lunch,
  build_muscle: MEAL_COLORS.dinner,
  get_stronger: MEAL_COLORS.breakfast,
  stay_healthy: MEAL_COLORS.snack,
};
