// Each kind read from the store apart from workouts (ADR 0100, 0103): how it looks, and how the
// system says whether it may be read and asks for it alone. A new kind goes here and in HEALTH_READS.
import type { IconName } from '@/components/ui/icon';
import type { ColorTokens } from '@/theme';

import type { HealthRead } from './connection';
import {
  healthStepsAllowed,
  healthWeightAllowed,
  requestHealthStepsAccess,
  requestHealthWeightAccess,
} from './health';

type Read = {
  icon: IconName;
  color: keyof ColorTokens;
  background: keyof ColorTokens;
  /** Whether the system lets it be read. */
  allowed: () => Promise<boolean>;
  /** Asks the system for it alone; whether it was allowed. */
  request: () => Promise<boolean>;
};

export const READS: Record<HealthRead, Read> = {
  weight: {
    icon: 'scale',
    color: 'water',
    background: 'waterBackground',
    allowed: healthWeightAllowed,
    request: requestHealthWeightAccess,
  },
  steps: {
    icon: 'steps',
    color: 'info',
    background: 'infoBackground',
    allowed: healthStepsAllowed,
    request: requestHealthStepsAccess,
  },
};
