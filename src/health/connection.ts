// Whether the signed-in user connected Benchbite to the phone's health store (#467). It belongs to
// the phone, as the store does, and to the user who agreed to it, so another user on the same
// phone starts unconnected.
import { useSyncExternalStore } from 'react';

import { readItem, writeItem } from '@/lib/device-storage';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const key = (userId: string) => `health.connected.${userId}`;

/** Whether the user connected the health store on this phone. */
export function isHealthConnected(userId: string): boolean {
  return readItem(key(userId)) === 'true';
}

/** Keeps whether the user connected the health store on this phone. */
export function setHealthConnected(userId: string, connected: boolean) {
  writeItem(key(userId), connected ? 'true' : null);
  for (const listener of listeners) {
    listener();
  }
}

/** Whether the user connected the health store on this phone, kept up to date. */
export function useHealthConnected(userId: string | undefined): boolean {
  return useSyncExternalStore(subscribe, () => (userId ? isHealthConnected(userId) : false));
}
