// Benchbite's link to the Apple Watch over WatchConnectivity (ADR 0109): it carries the protocol's
// messages as JSON. Without the native module, as in a build from before it, there is no watch.
import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type WatchLinkEvents = {
  /** Commands from the watch are waiting to be taken. */
  onCommands: () => void;
  /** The watch was paired, installed, came in or out of reach, or was heard from. */
  onStatus: () => void;
};

declare class WatchLinkModule extends NativeModule<WatchLinkEvents> {
  status(): {
    paired: boolean;
    installed: boolean;
    reachable: boolean;
    /** Until when the watch is taken to be there, heard from about the workout the phone runs. */
    heardUntil?: number | null;
    /** The end of the rest the watch then signalled, in milliseconds. */
    heardRest?: number | null;
  };
  /** Sends the state, with its workout's id, as only JavaScript reads the state. */
  sendState(json: string, workoutId: string | null): void;
  /** The commands kept since the last call, oldest first, each as JSON. */
  takeCommands(): string[];
  /**
   * Signals the end of this rest on the phone, in place of the one before, or of none with null:
   * the module alone schedules that notification on iOS, putting it off while the watch signals the
   * rest (ADR 0114).
   */
  signalRest(endsAt: number | null, title: string, body: string): void;
}

export const NativeWatchLink = requireOptionalNativeModule<WatchLinkModule>('WatchLink');
