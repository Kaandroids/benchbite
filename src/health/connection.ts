// Whether Benchbite reads the phone's health store (#467, ADR 0097). It belongs to the phone, as
// the store does, and to its owner: when another user signs in, it goes with the rest the device
// kept (ADR 0031).
import { useSyncExternalStore } from 'react';

import { readItem, writeItem } from '@/lib/device-storage';
import { createListeners } from '@/lib/listeners';

const KEY = 'health.connected';
const WRITE_SINCE_KEY = 'health.writeSince';

const listeners = createListeners();

export function isHealthConnected(): boolean {
  return readItem(KEY) === 'true';
}

/** Connects or disconnects the store; disconnecting stops saving workouts to it too (ADR 0105). */
export function setHealthConnected(connected: boolean) {
  writeItem(KEY, connected ? 'true' : null);
  if (!connected) writeItem(WRITE_SINCE_KEY, null);
  listeners.notify();
}

/** Whether Benchbite reads the phone's health store, kept up to date. */
export function useHealthConnected(): boolean {
  return useSyncExternalStore(listeners.subscribe, isHealthConnected);
}

/**
 * What is read from the store apart from the heart rate and calories of Benchbite's workouts, each
 * asked for on its own (ADR 0100, 0103, 0106).
 */
export const HEALTH_READS = ['weight', 'steps', 'workouts'] as const;
export type HealthRead = (typeof HEALTH_READS)[number];

/**
 * Whether a kind is read from the store: on, off when the user said not now, or not asked yet, as
 * for a user who connected before it was read.
 */
export type ReadSync = 'on' | 'off' | null;

const readKey = (kind: HealthRead) => `health.${kind}`;

export function readSync(kind: HealthRead): ReadSync {
  const stored = readItem(readKey(kind));
  return stored === 'on' || stored === 'off' ? stored : null;
}

export function setReadSync(kind: HealthRead, sync: ReadSync) {
  writeItem(readKey(kind), sync);
  listeners.notify();
}

/** Whether a kind is read from the store, kept up to date. */
export function useReadSync(kind: HealthRead): ReadSync {
  return useSyncExternalStore(listeners.subscribe, () => readSync(kind));
}

const STEPS_READ_ON_KEY = 'health.stepsReadOn';

/** The day, YYYY-MM-DD, the store's steps were last read on, from which the next read goes on. */
export function stepsReadOn(): string | null {
  return readItem(STEPS_READ_ON_KEY);
}

export function setStepsReadOn(day: string | null) {
  writeItem(STEPS_READ_ON_KEY, day);
}

const WORKOUTS_READ_ON_KEY = 'health.workoutsReadOn';

/** The day, YYYY-MM-DD, other apps' workouts were last read on, from which the next read goes on. */
export function workoutsReadOn(): string | null {
  return readItem(WORKOUTS_READ_ON_KEY);
}

export function setWorkoutsReadOn(day: string | null) {
  writeItem(WORKOUTS_READ_ON_KEY, day);
}

/**
 * Since when finished workouts are saved to the store (ADR 0105), or null while they are not: a
 * workout finished before writing was turned on is not saved.
 */
export function writeSince(): Date | null {
  const stored = readItem(WRITE_SINCE_KEY);
  return stored ? new Date(stored) : null;
}

export function setWriteSince(since: Date | null) {
  writeItem(WRITE_SINCE_KEY, since?.toISOString() ?? null);
  listeners.notify();
}

/** Whether workouts may be saved now: the store is connected and saving is on. */
export const mayWrite = () => isHealthConnected() && writeSince() !== null;

/** Whether finished workouts are saved to the store, kept up to date. */
export function useWritingWorkouts(): boolean {
  return useSyncExternalStore(listeners.subscribe, () => readItem(WRITE_SINCE_KEY) !== null);
}

/** Lets go of all the device keeps about the store, as when another user signs in. */
export function forgetHealthOnDevice() {
  writeItem(KEY, null);
  writeItem(WRITE_SINCE_KEY, null);
  for (const kind of HEALTH_READS) {
    writeItem(readKey(kind), null);
  }
  writeItem(STEPS_READ_ON_KEY, null);
  writeItem(WORKOUTS_READ_ON_KEY, null);
  listeners.notify();
}
