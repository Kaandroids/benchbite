// Opens Benchbite on the watch for a workout started there too (ADR 0115), once the phone has sent
// the watch that workout, so that the app it launches finds the workout to follow.
import type { Session } from '@/sessions/session';

import { link } from './link';
import { workoutIdOf, type WatchState } from './protocol';

/** The workout to open Benchbite on the watch for, once the watch is told that it follows it. */
let opening: string | null = null;

/**
 * Opens Benchbite on the watch for this workout once `WatchSync` has sent it: it needs `WatchSync`
 * mounted, as it is while signed in, which calls `sentToWatch` with each state it sends.
 */
export function openOnWatch(session: Pick<Session, 'id' | 'startedAt'>) {
  opening = workoutIdOf(session);
}

/** Takes a state `WatchSync` sent, which opens Benchbite on the watch when it carries that workout. */
export function sentToWatch(state: WatchState) {
  if (opening !== null && state.workout?.id === opening && state.workout.follows) {
    opening = null;
    link.startWatchApp?.();
  }
}
