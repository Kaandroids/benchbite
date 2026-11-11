// Small values kept on the device, read and written synchronously. An error is logged and read as
// nothing stored, or the value is not kept: losing one of these values is better than a crash.
import { Storage } from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { createListeners } from './listeners';
import { oneOf } from './one-of';

/** The value stored under a key, or null when there is none or it cannot be read. */
export function readItem(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return null;
  }
}

/** Stores a value under a key, or removes it with null. */
export function writeItem(key: string, value: string | null) {
  try {
    if (value === null) {
      Storage.removeItemSync(key);
    } else {
      Storage.setItemSync(key, value);
    }
  } catch (error) {
    console.warn(`Could not write ${key}`, error);
  }
}

/**
 * Reads a value kept on the device under `field`, beside the version of its shape: one of another
 * version is dropped instead of misread.
 */
export function readVersioned<T>(key: string, version: number, field: string): T | null {
  const stored = readItem(key);
  if (!stored) {
    return null;
  }
  try {
    const parsed = JSON.parse(stored) as { version?: number } & Record<string, T | undefined>;
    return parsed.version === version ? (parsed[field] ?? null) : null;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return null;
  }
}

/** Stores a value under `field` beside the version of its shape, or removes it with null. */
export function writeVersioned<T>(key: string, version: number, field: string, value: T | null) {
  writeItem(key, value === null ? null : JSON.stringify({ version, [field]: value }));
}

/**
 * A choice kept on the device under `key`, one of `choices`, `fallback` when none is kept or what
 * is kept is no longer one of them; `useChoice` keeps a screen up to date with it.
 */
export function createDeviceChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
) {
  const listeners = createListeners();
  const load = (): T => oneOf(choices, readItem(key) ?? undefined) ?? fallback;
  return {
    load,
    set(choice: T) {
      writeItem(key, choice === fallback ? null : choice);
      listeners.notify();
    },
    useChoice(): T {
      return useSyncExternalStore(listeners.subscribe, load);
    },
  };
}
