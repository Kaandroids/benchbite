// Small values kept on the device, read and written synchronously. An error is logged and read as
// nothing stored, or the value is not kept: losing one of these values is better than a crash.
import { Storage } from 'expo-sqlite/kv-store';

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
