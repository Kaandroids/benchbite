// Whether the watch is there for the workout, as it says every half a minute while it measures it
// (ADR 0114).
import { useEffect, useState } from 'react';

import { hasWatch, type WatchStatus } from '@/watch/types';
import { useWatchStatus } from '@/watch/watch-status';

import type { Session } from './session';

/**
 * Whether the watch is there for the workout at `now`: it follows the workout, is still paired
 * with Benchbite on it, and was heard from lately, as it is every half a minute while its workout
 * session runs.
 */
export function watchHeard(session: Session | null, status: WatchStatus, now: number): boolean {
  return (
    !!session?.watchFollows &&
    hasWatch(status) &&
    status.heardUntil !== null &&
    now < status.heardUntil
  );
}

/**
 * The watch's status while it is there for the workout, as the link last told it, or null; it
 * stops once the watch has not been heard from for that long.
 */
export function useHeardWatch(session: Session | null): WatchStatus | null {
  const status = useWatchStatus();
  // When it was last checked, which only the end of the time the watch was heard for moves on:
  // a sign heard since moves that end on, which is then later than this.
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const heard = watchHeard(session, status, checkedAt);
  useEffect(() => {
    if (!heard || status.heardUntil === null) return;
    const timer = setTimeout(() => setCheckedAt(Date.now()), status.heardUntil - Date.now());
    return () => clearTimeout(timer);
  }, [heard, status.heardUntil]);
  return heard ? status : null;
}
