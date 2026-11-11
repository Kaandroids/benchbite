import { Storage } from 'expo-sqlite/kv-store';

import { readItem, writeItem } from './device-storage';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: jest.fn((key: string) => items.get(key) ?? null),
      setItemSync: jest.fn((key: string, value: string) => {
        items.set(key, value);
      }),
      removeItemSync: jest.fn((key: string) => items.delete(key)),
    },
  };
});

describe('device storage', () => {
  it('keeps a value until it is removed', () => {
    expect(readItem('key')).toBeNull();
    writeItem('key', 'value');
    expect(readItem('key')).toBe('value');
    writeItem('key', null);
    expect(readItem('key')).toBeNull();
  });

  it('reads nothing and keeps nothing when the storage fails, without throwing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(Storage.getItemSync).mockImplementationOnce(() => {
      throw new Error('broken');
    });
    jest.mocked(Storage.setItemSync).mockImplementationOnce(() => {
      throw new Error('broken');
    });
    expect(readItem('key')).toBeNull();
    expect(() => writeItem('key', 'value')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
