// Which device signals the end of the workout's rest (ADR 0114).
import type { WatchStatus } from '@/watch/types';

import type { Session } from './session';
import { useHeardWatch, watchHeard } from './watch-heard';

/**
 * Whether the watch signals this very rest of the workout, given its status while it is heard from
 * about the workout, or null while it is not.
 */
export function signalsRest(session: Session | null, heard: WatchStatus | null): boolean {
  return heard !== null && heard.heardRest === session?.rest?.endsAt;
}

/**
 * Whether the watch signals the end of the workout's rest at `now`, so that the phone only keeps
 * its notification as a stand-in, which its module puts off while the watch is heard: the watch is
 * there for the workout, signalling this very rest.
 */
export function restOnWatch(session: Session | null, status: WatchStatus, now: number): boolean {
  return signalsRest(session, watchHeard(session, status, now) ? status : null);
}

/**
 * Whether the watch signals the end of the workout's rest, as the link last told its status; it
 * stops once the watch has not been heard from for that long.
 */
export function useRestOnWatch(session: Session | null): boolean {
  return signalsRest(session, useHeardWatch(session));
}
