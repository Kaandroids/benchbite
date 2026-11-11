// Which device signals the end of the workout's rest (ADR 0114).
import { useEffect, useState } from 'react';

import { WATCH_HEARD_FOR_MS } from '@/watch/protocol';
import type { WatchStatus } from '@/watch/types';
import { useWatchStatus } from '@/watch/watch-status';

import type { Session } from './session';

/**
 * Whether the watch signals the end of the workout's rest, so that the phone only keeps its
 * notification as a stand-in, which its module puts off while the watch is heard: the watch
 * follows the workout, is still paired with Benchbite on it, and was heard from lately, as it is
 * every half a minute while its workout session runs.
 */
export function restOnWatch(session: Session | null, status: WatchStatus, now: number): boolean {
  return (
    !!session?.watchFollows &&
    status.paired &&
    status.installed &&
    status.heardAt !== null &&
    now - status.heardAt < WATCH_HEARD_FOR_MS
  );
}

/**
 * Whether the watch signals the end of the workout's rest, as the link last told its status; it
 * stops once the watch has not been heard from for that long.
 */
export function useRestOnWatch(session: Session | null): boolean {
  const status = useWatchStatus();
  const [now, setNow] = useState(() => Date.now());
  const onWatch = restOnWatch(session, status, now);
  useEffect(() => {
    if (!onWatch || status.heardAt === null) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      status.heardAt + WATCH_HEARD_FOR_MS - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [onWatch, status.heardAt]);
  // A sign heard after the time last read is surely recent.
  return restOnWatch(session, status, Math.max(now, status.heardAt ?? 0));
}
