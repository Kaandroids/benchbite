// The Apple Watch, through the WatchConnectivity module (ADR 0109). It keeps the interface of
// link.ts; without the native module, as in a build from before it, there is no watch.
import { NativeWatchLink } from '@/modules/watch-link';

import { NO_WATCH, type WatchLink, type WatchStatus } from './types';

function status(): WatchStatus {
  const native = NativeWatchLink?.status();
  return native
    ? { ...native, heardUntil: native.heardUntil ?? null, heardRest: native.heardRest ?? null }
    : NO_WATCH;
}

/** Gives each command the native side kept to the listener; one that is not JSON is dropped. */
function takeCommands(listener: (message: unknown) => void) {
  for (const json of NativeWatchLink?.takeCommands() ?? []) {
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

export const link: WatchLink = {
  status: () => Promise.resolve(status()),
  onStatusChange: (listener) => {
    const subscription = NativeWatchLink?.addListener('onStatus', () => listener(status()));
    return () => subscription?.remove();
  },
  sendState: (state) =>
    NativeWatchLink?.sendState(JSON.stringify(state), state.workout?.id ?? null),
  signalRest: NativeWatchLink
    ? (rest) =>
        NativeWatchLink?.signalRest(rest?.endsAt ?? null, rest?.title ?? '', rest?.body ?? '')
    : undefined,
  onCommand: (listener) => {
    const subscription = NativeWatchLink?.addListener('onCommands', () => takeCommands(listener));
    // Those that arrived while nothing listened, as while the app was closed.
    takeCommands(listener);
    return () => subscription?.remove();
  },
};
