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

it('keeps whether the phone reads its health store', () => {
  expect(isHealthConnected()).toBe(false);

  setHealthConnected(true);
  expect(isHealthConnected()).toBe(true);

  setHealthConnected(false);
  expect(isHealthConnected()).toBe(false);
});

it('updates whoever shows it', async () => {
  const { result } = await renderHook(() => useHealthConnected());
  expect(result.current).toBe(false);

  await act(() => setHealthConnected(true));

  expect(result.current).toBe(true);
});
