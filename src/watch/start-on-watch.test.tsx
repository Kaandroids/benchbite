import { act, fireEvent, render, screen } from '@/test/render';

import { link } from './link';
import type { WatchState } from './protocol';
import {
  loadStartOnWatch,
  openOnWatch,
  sentToWatch,
  setStartOnWatch,
  startsOnWatch,
} from './start-on-watch';
import { StartOnWatchSheet } from './start-on-watch-sheet';
import { hasWatch, NO_WATCH, type WatchStatus } from './types';

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
jest.mock('./link', () => ({
  link: { status: jest.fn(), onStatusChange: () => () => undefined, startWatchApp: jest.fn() },
}));

const WATCH: WatchStatus = { ...NO_WATCH, paired: true, installed: true };

const TITLE = 'Start on your Apple Watch too?';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(link.status).mockResolvedValue(WATCH);
  setStartOnWatch('ask');
});

/** Asks, once the sheet shows; the answer comes wrapped, as an async function would wait for it. */
async function ask() {
  let answer: Promise<boolean | null> = Promise.resolve(false);
  await act(() => {
    answer = startsOnWatch();
  });
  expect(await screen.findByText(TITLE)).toBeTruthy();
  return { answer };
}

describe('hasWatch', () => {
  it('needs a paired watch with Benchbite on it', () => {
    expect(hasWatch(WATCH)).toBe(true);
    expect(hasWatch({ ...WATCH, installed: false })).toBe(false);
    expect(hasWatch(NO_WATCH)).toBe(false);
  });
});

describe('startsOnWatch', () => {
  it('starts on the phone alone without a watch, whatever the choice', async () => {
    jest.mocked(link.status).mockResolvedValue(NO_WATCH);
    setStartOnWatch('always');
    await expect(startsOnWatch()).resolves.toBe(false);
  });

  it('takes the status it last heard when it cannot read it', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    setStartOnWatch('always');
    await expect(startsOnWatch()).resolves.toBe(true);
    jest.mocked(link.status).mockRejectedValue(new Error('Not activated'));
    await expect(startsOnWatch()).resolves.toBe(true);
  });

  it('starts on the watch too, or not, as the user chose without asking', async () => {
    await render(<StartOnWatchSheet />);
    setStartOnWatch('always');
    await expect(startsOnWatch()).resolves.toBe(true);
    setStartOnWatch('never');
    await expect(startsOnWatch()).resolves.toBe(false);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it('asks, and answers with the watch', async () => {
    await render(<StartOnWatchSheet />);
    const { answer } = await ask();
    expect(screen.getByText('Rest alerts come only from the watch')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start on watch too' }));
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(loadStartOnWatch()).toBe('ask');
  });

  it('keeps the answer when asked not to ask again', async () => {
    await render(<StartOnWatchSheet />);
    const { answer } = await ask();
    await fireEvent.press(screen.getByRole('checkbox', { name: "Don't ask again" }));
    await fireEvent.press(screen.getByRole('button', { name: 'Only on this phone' }));
    await expect(answer).resolves.toBe(false);
    expect(loadStartOnWatch()).toBe('never');
  });

  it('does not start when the sheet is closed', async () => {
    await render(<StartOnWatchSheet />);
    const { answer } = await ask();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await expect(answer).resolves.toBeNull();
  });

  it('does not start when the question is left open as the sheet goes, or asked again', async () => {
    await render(<StartOnWatchSheet />);
    const { answer: first } = await ask();
    const { answer: second } = await ask();
    await expect(first).resolves.toBeNull();
    await screen.unmount();
    await expect(second).resolves.toBeNull();
    expect(loadStartOnWatch()).toBe('ask');
  });
});

describe('openOnWatch', () => {
  const sent = (id: string, follows: boolean) =>
    ({ workout: { id, follows } }) as unknown as WatchState;

  it('opens Benchbite on the watch once the watch is sent the workout it follows', () => {
    openOnWatch({ id: 'session-a', startedAt: 1 });
    sentToWatch(sent('session-b', true));
    sentToWatch(sent('session-a', false));
    expect(link.startWatchApp).not.toHaveBeenCalled();
    sentToWatch(sent('session-a', true));
    sentToWatch(sent('session-a', true));
    expect(link.startWatchApp).toHaveBeenCalledTimes(1);
  });
});
