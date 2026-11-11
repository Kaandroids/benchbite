// Which device signals the end of the workout's rest (ADR 0114).
import { useEffect, useState } from 'react';

import type { WatchStatus } from '@/watch/types';
import { useWatchStatus } from '@/watch/watch-status';

import type { Session } from './session';

/**
 * Whether the watch signals the end of the workout's rest at `now`, so that the phone only keeps
 * its notification as a stand-in, which its module puts off while the watch is heard: the watch
 * follows the workout, is still paired with Benchbite on it, and was heard from lately, as it is
 * every half a minute while its workout session runs, signalling this very rest.
 */
export function restOnWatch(session: Session | null, status: WatchStatus, now: number): boolean {
  return (
    !!session?.watchFollows &&
    status.paired &&
    status.installed &&
    status.heardUntil !== null &&
    now < status.heardUntil &&
    status.heardRest === session.rest?.endsAt
  );
}

/**
 * Whether the watch signals the end of the workout's rest, as the link last told its status; it
 * stops once the watch has not been heard from for that long.
 */
export function useRestOnWatch(session: Session | null): boolean {
  const status = useWatchStatus();
  // When it was last checked, which only the end of the time the watch was heard for moves on:
  // a sign heard since moves that end on, which is then later than this.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const onWatch = restOnWatch(session, status, checkedAt);
  useEffect(() => {
    if (!onWatch || status.heardUntil === null) return;
    const timer = setTimeout(() => setCheckedAt(Date.now()), status.heardUntil - Date.now());
    return () => clearTimeout(timer);
  }, [onWatch, status.heardUntil]);
  return onWatch;
}
