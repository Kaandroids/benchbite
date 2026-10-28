import type { IconName } from '@/components/ui/icon';
import type { Database } from '@/lib/database.types';

type Goal = Database['public']['Enums']['goal_kind'];

/** The icon of each goal, on the goal cards. */
export const GOAL_ICONS: Record<Goal, IconName> = {
  lose_fat: 'flame',
  build_muscle: 'dumbbell',
  get_stronger: 'bolt',
  stay_healthy: 'heart',
};
