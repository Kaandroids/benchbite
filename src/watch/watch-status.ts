import { useEffect, useState } from 'react';

import type { Session } from '@/sessions/session';

import { link } from './link';
import { NO_WATCH, type WatchStatus } from './types';

/** The watch's status, as the link last told it. */
export function useWatchStatus(): WatchStatus {
  const [status, setStatus] = useState(NO_WATCH);
  useEffect(() => {
    // A change heard first is newer than the status asked for.
    let heard = false;
    const stop = link.onStatusChange((changed) => {
      heard = true;
      setStatus(changed);
    });
    link
      .status()
      .then((first) => {
        if (!heard) setStatus(first);
      })
      .catch((error: unknown) => console.warn('Could not read the watch status', error));
    return () => {
      heard = true;
      stop();
    };
  }, []);
  return status;
}

/**
 * Whether the watch signals the end of the workout's rest, so that the phone does not (ADR 0112):
 * it follows the workout, started or last changed the rest, and is still paired with Benchbite on
 * it. A rest started on the phone the phone signals, as the watch app, asleep, may not hear of it.
 */
export function watchSignalsRest(session: Session | null, status: WatchStatus): boolean {
  return !!session?.watchFollows && !!session.rest?.byWatch && status.paired && status.installed;
}

/** Whether the watch signals the end of the workout's rest, as the link last told its status. */
export function useWatchSignalsRest(session: Session | null): boolean {
  return watchSignalsRest(session, useWatchStatus());
}
