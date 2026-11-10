// Benchbite's link to the Apple Watch over WatchConnectivity (ADR 0109): it carries the protocol's
// messages as JSON. Without the native module, as in a build from before it, there is no watch.
import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type WatchLinkEvents = {
  /** Commands from the watch are waiting to be taken. */
  onCommands: () => void;
  /** The watch was paired, installed, or came in or out of reach. */
  onStatus: () => void;
};

declare class WatchLinkModule extends NativeModule<WatchLinkEvents> {
  status(): { paired: boolean; installed: boolean; reachable: boolean };
  sendState(json: string): void;
  /** The commands kept since the last call, oldest first, each as JSON. */
  takeCommands(): string[];
}

export const WatchLink = requireOptionalNativeModule<WatchLinkModule>('WatchLink');
