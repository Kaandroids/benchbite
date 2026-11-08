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
