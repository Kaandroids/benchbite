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
  /**
   * Until when it is taken to be there, heard from about the workout the phone runs, in
   * milliseconds (ADR 0114).
   */
  heardUntil: number | null;
  /** The end of the rest it then signalled, in milliseconds. */
  heardRest: number | null;
};

/** No watch to talk to. */
export const NO_WATCH: WatchStatus = {
  paired: false,
  installed: false,
  reachable: false,
  heardUntil: null,
  heardRest: null,
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
  /**
   * Where the link signals rests, on iOS, the phone's notification of the end of a rest goes
   * through it, or none with null, as it puts it off while the watch signals the rest (ADR 0114).
   */
  signalRest?: (rest: { endsAt: number; title: string; body: string } | null) => void;
  /** Where the watch can be opened from the phone, on iOS, opens Benchbite on it (ADR 0115). */
  startWatchApp?: () => void;
};
