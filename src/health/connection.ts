// Whether Benchbite reads the phone's health store (#467, ADR 0097). It belongs to the phone, as
// the store does, and to its owner: when another user signs in, it goes with the rest the device
// kept (ADR 0031).
import { useSyncExternalStore } from 'react';

import { readItem, writeItem } from '@/lib/device-storage';

const KEY = 'health.connected';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function isHealthConnected(): boolean {
  return readItem(KEY) === 'true';
}

export function setHealthConnected(connected: boolean) {
  writeItem(KEY, connected ? 'true' : null);
  notify();
}

/** Whether Benchbite reads the phone's health store, kept up to date. */
export function useHealthConnected(): boolean {
  return useSyncExternalStore(subscribe, isHealthConnected);
}

/** What is read from the store apart from workouts, each asked for on its own (ADR 0100, 0103). */
export const HEALTH_READS = ['weight', 'steps'] as const;
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
  notify();
}

/** Whether a kind is read from the store, kept up to date. */
export function useReadSync(kind: HealthRead): ReadSync {
  return useSyncExternalStore(subscribe, () => readSync(kind));
}

const STEPS_READ_ON_KEY = 'health.stepsReadOn';

/** The day, YYYY-MM-DD, the store's steps were last read on, from which the next read goes on. */
export function stepsReadOn(): string | null {
  return readItem(STEPS_READ_ON_KEY);
}

export function setStepsReadOn(day: string | null) {
  writeItem(STEPS_READ_ON_KEY, day);
}

/** Lets go of all the device keeps about the store, as when another user signs in. */
export function forgetHealthOnDevice() {
  writeItem(KEY, null);
  for (const kind of HEALTH_READS) {
    writeItem(readKey(kind), null);
  }
  writeItem(STEPS_READ_ON_KEY, null);
  notify();
}
