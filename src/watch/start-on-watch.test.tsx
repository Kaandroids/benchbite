import { act, fireEvent, render, screen } from '@/test/render';

import { hasWatch, loadStartOnWatch, setStartOnWatch, startsOnWatch } from './start-on-watch';
import { StartOnWatchSheet } from './start-on-watch-sheet';
import { NO_WATCH, type WatchStatus } from './types';

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

const WATCH: WatchStatus = { ...NO_WATCH, paired: true, installed: true };

beforeEach(() => setStartOnWatch('ask'));

describe('hasWatch', () => {
  it('needs a paired watch with Benchbite on it', () => {
    expect(hasWatch(WATCH)).toBe(true);
    expect(hasWatch({ ...WATCH, installed: false })).toBe(false);
    expect(hasWatch(NO_WATCH)).toBe(false);
  });
});

describe('startsOnWatch', () => {
  it('starts on the phone alone without a watch, whatever the choice', async () => {
    setStartOnWatch('always');
    await expect(startsOnWatch(NO_WATCH)).resolves.toBe(false);
  });

  it('starts on the watch too, or not, as the user chose without asking', async () => {
    await render(<StartOnWatchSheet />);
    setStartOnWatch('always');
    await expect(startsOnWatch(WATCH)).resolves.toBe(true);
    setStartOnWatch('never');
    await expect(startsOnWatch(WATCH)).resolves.toBe(false);
    expect(screen.queryByText('Start on your Apple Watch too?')).toBeNull();
  });

  it('asks, and answers with the watch', async () => {
    await render(<StartOnWatchSheet />);
    let answer: Promise<boolean> = Promise.resolve(false);
    await act(() => {
      answer = startsOnWatch(WATCH);
    });
    expect(screen.getByText('Start on your Apple Watch too?')).toBeTruthy();
    expect(screen.getByText('Rest alerts come only from the watch')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start on watch too' }));
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByText('Start on your Apple Watch too?')).toBeNull();
    expect(loadStartOnWatch()).toBe('ask');
  });

  it('keeps the answer when asked not to ask again', async () => {
    await render(<StartOnWatchSheet />);
    let answer: Promise<boolean> = Promise.resolve(true);
    await act(() => {
      answer = startsOnWatch(WATCH);
    });
    await fireEvent.press(screen.getByRole('checkbox', { name: "Don't ask again" }));
    await fireEvent.press(screen.getByRole('button', { name: 'Only on this phone' }));
    await expect(answer).resolves.toBe(false);
    expect(loadStartOnWatch()).toBe('never');
  });

  it('starts on the phone alone when the question is left open as the sheet goes', async () => {
    await render(<StartOnWatchSheet />);
    let answer: Promise<boolean> = Promise.resolve(true);
    await act(() => {
      answer = startsOnWatch(WATCH);
    });
    await screen.unmount();
    await expect(answer).resolves.toBe(false);
    expect(loadStartOnWatch()).toBe('ask');
  });
});
