import { useSyncExternalStore } from 'react';

import { link } from './link';
import { NO_WATCH, type WatchStatus } from './types';

// The watch's status, as the link last told it, shared by everything that shows or depends on it,
// so that all read the same: asked for once, then kept by the link's changes.
let status: WatchStatus = NO_WATCH;
let listening = false;
const listeners = new Set<() => void>();

function changed(next: WatchStatus) {
  status = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
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
  return () => listeners.delete(listener);
}

/** The watch's status, as the link last told it. */
export function useWatchStatus(): WatchStatus {
  return useSyncExternalStore(subscribe, () => status);
}

/** For tests: forgets the status and listens again when next used. */
export function resetWatchStatus() {
  status = NO_WATCH;
  listening = false;
}
