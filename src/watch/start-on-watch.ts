// Whether a workout started on the phone starts on the watch too (ADR 0115): asked at each start,
// always, or never, as the user chose in the settings, and only with a watch to start it on. The
// choice belongs to the device, as the watch does.
import { useSyncExternalStore } from 'react';

import { readItem, writeItem } from '@/lib/device-storage';

import type { WatchStatus } from './types';

export const START_ON_WATCH_CHOICES = ['ask', 'always', 'never'] as const;
export type StartOnWatchChoice = (typeof START_ON_WATCH_CHOICES)[number];

const KEY = 'watch.startOnWatch';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadStartOnWatch(): StartOnWatchChoice {
  const stored = readItem(KEY);
  return START_ON_WATCH_CHOICES.find((choice) => choice === stored) ?? 'ask';
}

export function setStartOnWatch(choice: StartOnWatchChoice) {
  writeItem(KEY, choice);
  for (const listener of listeners) {
    listener();
  }
}

export function useStartOnWatch(): StartOnWatchChoice {
  return useSyncExternalStore(subscribe, loadStartOnWatch);
}

/** Whether there is a watch to start a workout on: paired, with Benchbite on it. */
export function hasWatch(status: WatchStatus): boolean {
  return status.paired && status.installed;
}

/** The answer to "Start on your Apple Watch too?": on the watch or only on the phone, and kept. */
export type StartOnWatchAnswer = { onWatch: boolean; keep: boolean };

let pending: ((answer: StartOnWatchAnswer) => void) | null = null;
const sheetListeners = new Set<() => void>();

function setPending(value: typeof pending) {
  pending = value;
  for (const listener of sheetListeners) {
    listener();
  }
}

/** The question open in `StartOnWatchSheet`, answered with `answer`; none when none is. */
export function useStartOnWatchQuestion() {
  return useSyncExternalStore(
    (listener) => {
      sheetListeners.add(listener);
      return () => sheetListeners.delete(listener);
    },
    () => pending,
  );
}

/** Answers the question still open, if any, with the phone alone. */
export function cancelStartOnWatch() {
  pending?.({ onWatch: false, keep: false });
}

/** Asks "Start on your Apple Watch too?" in `StartOnWatchSheet`; closing it starts on the phone. */
export function askStartOnWatch(): Promise<StartOnWatchAnswer> {
  cancelStartOnWatch();
  return new Promise((resolve) => {
    setPending((answer) => {
      setPending(null);
      resolve(answer);
    });
  });
}

/**
 * Whether a workout about to start starts on the watch too: never without a watch; else as the
 * user chose, asking when they chose to be asked, and keeping an answer they ask not to be asked
 * again.
 */
export async function startsOnWatch(status: WatchStatus): Promise<boolean> {
  if (!hasWatch(status)) return false;
  const choice = loadStartOnWatch();
  if (choice !== 'ask') return choice === 'always';
  const { onWatch, keep } = await askStartOnWatch();
  if (keep) setStartOnWatch(onWatch ? 'always' : 'never');
  return onWatch;
}
