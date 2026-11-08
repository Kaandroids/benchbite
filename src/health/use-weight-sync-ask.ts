import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { setWeightSync, useHealthConnected, useWeightSync } from './connection';
import { healthStore, requestHealthWeightAccess } from './health';
import { importHealthWeights } from './weight-import';

/**
 * Asking once to read weight, for a user who connected the store before it was read (#22,
 * ADR 0100): whether to ask, bringing the weights in, and not now, which ends the asking.
 */
export function useWeightSyncAsk() {
  const queryClient = useQueryClient();
  const connected = useHealthConnected();
  const sync = useWeightSync();
  const [busy, setBusy] = useState(false);

  const bringIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const allowed = await requestHealthWeightAccess();
      setWeightSync(allowed ? 'on' : 'off');
      if (allowed) await importHealthWeights(queryClient);
    } catch (error) {
      console.warn('Could not bring in the weights from the health store', error);
    } finally {
      setBusy(false);
    }
  };

  const notNow = () => {
    if (!busy) setWeightSync('off');
  };

  return { asking: healthStore !== null && connected && sync === null, busy, bringIn, notNow };
}
