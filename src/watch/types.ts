import type { WatchState } from './protocol';

/** Whether a watch is there to follow the workout. */
export type WatchStatus = {
  /** A watch is paired with the phone. */
  paired: boolean;
  /** Benchbite's app is on it. */
  installed: boolean;
  /** It can be talked to right now. */
  reachable: boolean;
};

/**
 * How the app talks to a watch, which each platform implements over its own channel (ADR 0109).
 * It carries the protocol's messages and nothing else: what they mean is decided in protocol.ts.
 */
export type WatchLink = {
  status(): Promise<WatchStatus>;
  /** Listens for the status changing; returns what stops listening. */
  onStatusChange(listener: (status: WatchStatus) => void): () => void;
  /** Sends the latest state; a newer one replaces one the watch has not received yet. */
  sendState(state: WatchState): void;
  /**
   * Listens for messages from the watch, those that arrived while the app was closed included;
   * returns what stops listening. A message is checked with parseCommand() before it is used.
   */
  onCommand(listener: (message: unknown) => void): () => void;
};
