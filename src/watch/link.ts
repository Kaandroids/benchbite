// Where the app has no watch to talk to, as on the web and, for now, on Android (#471). iOS talks
// to the Apple Watch through link.ios.ts, which keeps the same interface (ADR 0109).
import { WATCH_HEARD_FOR_MS } from './protocol';
import { NO_WATCH, type WatchLink } from './types';

export const link: WatchLink = {
  heardForMs: WATCH_HEARD_FOR_MS,
  status: () => Promise.resolve(NO_WATCH),
  onStatusChange: () => () => undefined,
  sendState: () => undefined,
  onCommand: () => () => undefined,
};
