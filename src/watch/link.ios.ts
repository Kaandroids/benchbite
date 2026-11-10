// The Apple Watch, through the WatchConnectivity module (ADR 0109). It keeps the interface of
// link.ts; without the native module, as in a build from before it, there is no watch.
import { WatchLink } from '@/modules/watch-link';

import type { WatchLink as Link, WatchStatus } from './types';

const NO_WATCH: WatchStatus = { paired: false, installed: false, reachable: false };

const status = (): WatchStatus => WatchLink?.status() ?? NO_WATCH;

/** Gives each command the native side kept to the listener; one that is not JSON is dropped. */
function takeCommands(listener: (message: unknown) => void) {
  for (const json of WatchLink?.takeCommands() ?? []) {
    let message: unknown;
    try {
      message = JSON.parse(json);
    } catch {
      console.warn('Dropped a message from the watch that is not JSON');
      continue;
    }
    listener(message);
  }
}

export const link: Link = {
  status: () => Promise.resolve(status()),
  onStatusChange: (listener) => {
    const subscription = WatchLink?.addListener('onStatus', () => listener(status()));
    return () => subscription?.remove();
  },
  sendState: (state) => WatchLink?.sendState(JSON.stringify(state)),
  onCommand: (listener) => {
    const subscription = WatchLink?.addListener('onCommands', () => takeCommands(listener));
    // Those that arrived while nothing listened, as while the app was closed.
    takeCommands(listener);
    return () => subscription?.remove();
  },
};
