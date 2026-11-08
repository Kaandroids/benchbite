import { act, renderHook } from '@/test/render';

import { isHealthConnected, setHealthConnected, useHealthConnected } from './connection';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});

it('keeps the connection for each user on the phone', () => {
  setHealthConnected('user-a', true);

  expect(isHealthConnected('user-a')).toBe(true);
  expect(isHealthConnected('user-b')).toBe(false);

  setHealthConnected('user-a', false);
  expect(isHealthConnected('user-a')).toBe(false);
});

it('updates whoever shows it', async () => {
  const { result } = await renderHook(() => useHealthConnected('user-c'));
  expect(result.current).toBe(false);

  await act(() => setHealthConnected('user-c', true));

  expect(result.current).toBe(true);
});

it('is never connected without a user', async () => {
  const { result } = await renderHook(() => useHealthConnected(undefined));
  expect(result.current).toBe(false);
});
