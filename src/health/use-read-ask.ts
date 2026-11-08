import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { setReadSync, useHealthConnected, useReadSync, type HealthRead } from './connection';
import { healthStore } from './health';
import { READ_KINDS } from './read-kinds';

/**
 * Asking once to read a kind, for a user who connected the store before it was read (ADR 0100,
 * 0103): whether to ask, bringing it in, and not now, which ends the asking.
 */
export function useReadAsk(kind: HealthRead) {
  const queryClient = useQueryClient();
  const connected = useHealthConnected();
  const sync = useReadSync(kind);
  const [busy, setBusy] = useState(false);

  const bringIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const allowed = await READ_KINDS[kind].request();
      setReadSync(kind, allowed ? 'on' : 'off');
      if (allowed) await READ_KINDS[kind].bringIn(queryClient);
    } catch (error) {
      console.warn(`Could not bring in the ${kind} from the health store`, error);
    } finally {
      setBusy(false);
    }
  };

  const notNow = () => {
    if (!busy) setReadSync(kind, 'off');
  };

  return {
    kind,
    asking: healthStore !== null && connected && sync === null,
    busy,
    bringIn,
    notNow,
  };
}

/** Whether a kind is read from the store now, for the screens that show it. */
export function useReading(kind: HealthRead): boolean {
  const connected = useHealthConnected();
  const sync = useReadSync(kind);
  return healthStore !== null && connected && sync === 'on';
}
