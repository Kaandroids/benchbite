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

export function isHealthConnected(): boolean {
  return readItem(KEY) === 'true';
}

export function setHealthConnected(connected: boolean) {
  writeItem(KEY, connected ? 'true' : null);
  for (const listener of listeners) {
    listener();
  }
}

/** Whether Benchbite reads the phone's health store, kept up to date. */
export function useHealthConnected(): boolean {
  return useSyncExternalStore(subscribe, isHealthConnected);
}

const WEIGHT_KEY = 'health.weight';
const WEIGHTS_READ_AT_KEY = 'health.weightsReadAt';

/**
 * Whether weight is read from the store (ADR 0100): on, off when the user said not now, or not
 * asked yet, as for a user who connected before weight was read.
 */
export type WeightReading = 'on' | 'off' | null;

export function weightReading(): WeightReading {
  const stored = readItem(WEIGHT_KEY);
  return stored === 'on' || stored === 'off' ? stored : null;
}

export function setWeightReading(reading: WeightReading) {
  writeItem(WEIGHT_KEY, reading);
  for (const listener of listeners) {
    listener();
  }
}

/** Whether weight is read from the store, kept up to date. */
export function useWeightReading(): WeightReading {
  return useSyncExternalStore(subscribe, weightReading);
}

/** When the store's weights were last read, to read only what came since. */
export function weightsReadAt(): Date | null {
  const stored = readItem(WEIGHTS_READ_AT_KEY);
  return stored ? new Date(stored) : null;
}

export function setWeightsReadAt(at: Date | null) {
  writeItem(WEIGHTS_READ_AT_KEY, at ? at.toISOString() : null);
}
