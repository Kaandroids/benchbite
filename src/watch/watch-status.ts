import { useSyncExternalStore } from 'react';

import { createListeners } from '@/lib/listeners';

import { link } from './link';
import { NO_WATCH, type WatchStatus } from './types';

// The watch's status, as the link last told it, shared by everything that shows or depends on it,
// so that all read the same: asked for once, then kept by the link's changes.
let status: WatchStatus = NO_WATCH;
let listening = false;
const listeners = createListeners();

function changed(next: WatchStatus) {
  status = next;
  listeners.notify();
}

function subscribe(listener: () => void) {
  const unsubscribe = listeners.subscribe(listener);
  if (!listening) {
    listening = true;
    // A change heard first is newer than the status asked for.
    let heard = false;
    link.onStatusChange((next) => {
      heard = true;
      changed(next);
    });
    link
      .status()
      .then((first) => {
        if (!heard) changed(first);
      })
      .catch((error: unknown) => console.warn('Could not read the watch status', error));
  }
  return unsubscribe;
}

/** The watch's status, as the link last told it. */
export function useWatchStatus(): WatchStatus {
  return useSyncExternalStore(subscribe, () => status);
}

/**
 * The watch's status asked for now, as when a workout starts, and kept for everything that shows
 * it; the one last told when it cannot be read.
 */
export async function readWatchStatus(): Promise<WatchStatus> {
  try {
    const next = await link.status();
    changed(next);
    return next;
  } catch (error) {
    console.warn('Could not read the watch status', error);
    return status;
  }
}

/** For tests: forgets the status and listens again when next used. */
export function resetWatchStatus() {
  status = NO_WATCH;
  listening = false;
}
