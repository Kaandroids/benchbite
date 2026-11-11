// Whether a workout started on the phone starts on the watch too (ADR 0115): asked at each start,
// always, or never, as the user chose in the settings, and only with a watch to start it on. The
// choice belongs to the device, as the watch does.
import { useSyncExternalStore } from 'react';

import { readItem, writeItem } from '@/lib/device-storage';
import { createQuestion } from '@/lib/question';
import type { Session } from '@/sessions/session';

import { link } from './link';
import { workoutIdOf, type WatchState } from './protocol';
import { hasWatch } from './types';
import { readWatchStatus } from './watch-status';

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

/** The answer to "Start on your Apple Watch too?": on the watch or only on the phone, and kept. */
export type StartOnWatchAnswer = { onWatch: boolean; keep: boolean };

/** The question, answered with null when it is closed or left open: the workout does not start. */
const watchQuestion = createQuestion<void, StartOnWatchAnswer | null>(null);

/** Asks "Start on your Apple Watch too?" in `StartOnWatchSheet`. */
export const askStartOnWatch = watchQuestion.ask;
/** Answers the question still open, if any, with null. */
export const cancelStartOnWatch = watchQuestion.cancel;
/** The question shown in `StartOnWatchSheet`, with its answer; none when none is. */
export const useStartOnWatchQuestion = watchQuestion.useQuestion;

/**
 * Whether a workout about to start starts on the watch too: never without a watch; else as the
 * user chose, asking when they chose to be asked, and keeping an answer they ask not to be asked
 * again. Null when it is not to start, as the question was closed.
 */
export async function startsOnWatch(): Promise<boolean | null> {
  if (!hasWatch(await readWatchStatus())) return false;
  const choice = loadStartOnWatch();
  if (choice !== 'ask') return choice === 'always';
  const answer = await askStartOnWatch();
  if (!answer) return null;
  if (answer.keep) setStartOnWatch(answer.onWatch ? 'always' : 'never');
  return answer.onWatch;
}

/** The workout to open Benchbite on the watch for, once the watch is told that it follows it. */
let opening: string | null = null;

/**
 * Opens Benchbite on the watch for a workout started there too, once the phone has sent it the
 * workout, so that the app it launches finds the workout to follow.
 */
export function openOnWatch(session: Pick<Session, 'id' | 'startedAt'>) {
  opening = workoutIdOf(session);
}

/** Takes a state sent to the watch, which opens Benchbite on it when it carries that workout. */
export function sentToWatch(state: WatchState) {
  if (opening !== null && state.workout?.id === opening && state.workout.follows) {
    opening = null;
    link.startWatchApp?.();
  }
}
