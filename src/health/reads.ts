// How each kind read from the store apart from workouts looks (ADR 0100, 0103), wherever it is
// named: the consent sheet, the ask card and its own cards. What reads it is in read-kinds.ts.
import type { IconName } from '@/components/ui/icon';
import type { ColorTokens } from '@/theme';

import type { HealthRead } from './connection';

export const READ_LOOKS: Record<
  HealthRead,
  { icon: IconName; color: keyof ColorTokens; background: keyof ColorTokens }
> = {
  weight: { icon: 'scale', color: 'water', background: 'waterBackground' },
  steps: { icon: 'steps', color: 'info', background: 'infoBackground' },
};
