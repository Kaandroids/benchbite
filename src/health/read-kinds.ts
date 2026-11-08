// How each kind read from the store apart from workouts is read (ADR 0100, 0103): whether the system
// lets it be read, asking for it alone, and taking it in. A new kind goes in HEALTH_READS, here and
// in READ_LOOKS; the types name what is missing.
import type { QueryClient } from '@tanstack/react-query';

import type { HealthRead } from './connection';
import {
  healthStepsAllowed,
  healthWeightAllowed,
  requestHealthStepsAccess,
  requestHealthWeightAccess,
} from './health';
import { importHealthSteps } from './steps-import';
import { importHealthWeights } from './weight-import';

type ReadKind = {
  /** Whether the system lets it be read. */
  allowed: () => Promise<boolean>;
  /** Asks the system for it alone; whether it was allowed. */
  request: () => Promise<boolean>;
  /** Takes in what the store holds of it; whether anything changed. */
  bringIn: (queryClient: QueryClient) => Promise<boolean>;
};

export const READ_KINDS: Record<HealthRead, ReadKind> = {
  weight: {
    allowed: healthWeightAllowed,
    request: requestHealthWeightAccess,
    bringIn: importHealthWeights,
  },
  steps: {
    allowed: healthStepsAllowed,
    request: requestHealthStepsAccess,
    bringIn: importHealthSteps,
  },
};
