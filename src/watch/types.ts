import type { WatchState } from './protocol';

/**
 * Whether a watch is there to follow the workout, which decides whether starting one asks to start
 * it on the watch too (ADR 0109).
 */
export type WatchStatus = {
  /** A watch is paired with the phone. */
  paired: boolean;
  /** Benchbite's app is on it. */
  installed: boolean;
  /** It can be talked to right now. */
  reachable: boolean;
  /** When it was last heard from about the workout the phone runs, in milliseconds (ADR 0114). */
  heardAt: number | null;
};

/** No watch to talk to. */
export const NO_WATCH: WatchStatus = {
  paired: false,
  installed: false,
  reachable: false,
  heardAt: null,
};

/**
 * How the app talks to a watch, which each platform implements over its own channel (ADR 0109).
 * It carries the protocol's messages and nothing else: what they mean is decided in protocol.ts.
 */
export type WatchLink = {
  /** How long the watch is taken to be there after it was heard, in milliseconds (ADR 0114). */
  heardForMs: number;
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
