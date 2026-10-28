import { type IconName } from '@/components/ui/icon';
import { type ColorTokens } from '@/theme';

/**
 * The icon of each answer the calculated goals are worked out from, on the daily goals and the
 * review of new answers. Each has its own colour, borrowed from the meals, so the rows read apart.
 */
export const BASIS_ICONS: Record<
  'goal' | 'target' | 'pace' | 'activity',
  { icon: IconName; color: keyof ColorTokens; background: keyof ColorTokens }
> = {
  goal: { icon: 'target', color: 'lunch', background: 'lunchBackground' },
  target: { icon: 'scale', color: 'dinner', background: 'dinnerBackground' },
  pace: { icon: 'speed', color: 'breakfast', background: 'breakfastBackground' },
  activity: { icon: 'person', color: 'water', background: 'waterBackground' },
};
