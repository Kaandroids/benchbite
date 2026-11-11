import { useSyncExternalStore } from 'react';

import { readItem, writeItem } from './device-storage';
import { createListeners } from './listeners';
import { oneOf } from './one-of';

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
