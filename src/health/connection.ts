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

const WEIGHT_KEY = 'health.weight';

/**
 * Whether weight is read from the store (ADR 0100): on, off when the user said not now, or not
 * asked yet, as for a user who connected before weight was read.
 */
export type WeightSync = 'on' | 'off' | null;

export function weightSync(): WeightSync {
  const stored = readItem(WEIGHT_KEY);
  return stored === 'on' || stored === 'off' ? stored : null;
}

export function setWeightSync(sync: WeightSync) {
  writeItem(WEIGHT_KEY, sync);
  notify();
}

/** Whether weight is read from the store, kept up to date. */
export function useWeightSync(): WeightSync {
  return useSyncExternalStore(subscribe, weightSync);
}
