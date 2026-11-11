// Which device signals the end of the workout's rest (ADR 0112).
import { useWatchStatus } from '@/watch/watch-status';
import type { WatchStatus } from '@/watch/types';

import type { Session } from './session';

/**
 * Whether the watch signals the end of the workout's rest, so that the phone does not: it follows
 * the workout, started or last changed the rest, and is still paired with Benchbite on it. A rest
 * started on the phone the phone signals, as the watch app, asleep, may not hear of it.
 */
export function restOnWatch(session: Session | null, status: WatchStatus): boolean {
  return !!session?.watchFollows && !!session.rest?.byWatch && status.paired && status.installed;
}

/** Whether the watch signals the end of the workout's rest, as the link last told its status. */
export function useRestOnWatch(session: Session | null): boolean {
  return restOnWatch(session, useWatchStatus());
}
