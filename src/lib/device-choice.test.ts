import { act, renderHook } from '@/test/render';

import { createDeviceChoice } from './device-choice';
import { readItem, writeItem } from './device-storage';

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

describe('createDeviceChoice', () => {
  const choice = createDeviceChoice('test.choice', ['ask', 'always', 'never'] as const, 'ask');

  beforeEach(() => writeItem('test.choice', null));

  it('reads the fallback until a choice is kept, and keeps none for the fallback', () => {
    expect(choice.load()).toBe('ask');
    choice.set('never');
    expect(readItem('test.choice')).toBe('never');
    choice.set('ask');
    expect(readItem('test.choice')).toBeNull();
  });

  it('reads the fallback for a kept value that is no longer a choice', () => {
    writeItem('test.choice', 'sometimes');
    expect(choice.load()).toBe('ask');
  });

  it('keeps a screen up to date with the choice', async () => {
    const { result } = await renderHook(() => choice.useChoice());
    expect(result.current).toBe('ask');
    await act(() => choice.set('always'));
    expect(result.current).toBe('always');
  });
});
