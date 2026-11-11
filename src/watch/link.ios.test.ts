import { PROTOCOL_VERSION, type WatchState } from './protocol';
import { NO_WATCH } from './types';

type Listener = () => void;

/** A native module as in a build with it: its events are fired by the test. */
function fakeModule() {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    status: jest.fn(
      (): { paired: boolean; installed: boolean; reachable: boolean; heardAt?: number } => ({
        paired: true,
        installed: true,
        reachable: false,
      }),
    ),
    sendState: jest.fn(),
    takeCommands: jest.fn((): string[] => []),
    addListener: jest.fn((event: string, listener: Listener) => {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    }),
  };
}

/** link.ios.ts with the native module given, or none. */
function load(native: ReturnType<typeof fakeModule> | null) {
  let loaded: typeof import('./link.ios') | undefined;
  jest.isolateModules(() => {
    jest.doMock('@/modules/watch-link', () => ({ NativeWatchLink: native }));
    loaded = jest.requireActual<typeof import('./link.ios')>('./link.ios');
  });
  return loaded!.link;
}

const STATE: WatchState = { v: PROTOCOL_VERSION, seq: 1, workout: null, ended: [] };

it('sends the state as JSON, with its workout’s id', () => {
  const native = fakeModule();
  const link = load(native);
  link.sendState(STATE);
  expect(native.sendState).toHaveBeenCalledWith(JSON.stringify(STATE), null);
  const running = { ...STATE, workout: { id: 'workout-1' } } as unknown as WatchState;
  link.sendState(running);
  expect(native.sendState).toHaveBeenLastCalledWith(JSON.stringify(running), 'workout-1');
});

it('gives the commands that waited, and those that arrive later, in order', () => {
  const native = fakeModule();
  native.takeCommands.mockReturnValueOnce(['{"id":"a"}', '{"id":"b"}']);
  const received: unknown[] = [];
  const stop = load(native).onCommand((message) => received.push(message));
  expect(received).toEqual([{ id: 'a' }, { id: 'b' }]);

  native.takeCommands.mockReturnValueOnce(['{"id":"c"}']);
  native.listeners.get('onCommands')!();
  expect(received).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

  stop();
  expect(native.listeners.has('onCommands')).toBe(false);
});

it('drops a command that is not JSON', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const native = fakeModule();
  native.takeCommands.mockReturnValueOnce(['not json', '{"id":"a"}']);
  const received: unknown[] = [];
  load(native).onCommand((message) => received.push(message));
  expect(received).toEqual([{ id: 'a' }]);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it('tells the watch’s status, and when it changes', async () => {
  const native = fakeModule();
  const link = load(native);
  // Not heard from yet.
  expect(await link.status()).toEqual({
    paired: true,
    installed: true,
    reachable: false,
    heardAt: null,
  });
  const listener = jest.fn();
  link.onStatusChange(listener);
  native.status.mockReturnValue({ paired: true, installed: true, reachable: true, heardAt: 7 });
  native.listeners.get('onStatus')!();
  expect(listener).toHaveBeenCalledWith({
    paired: true,
    installed: true,
    reachable: true,
    heardAt: 7,
  });
});

it('has no watch in a build without the native module', async () => {
  const link = load(null);
  expect(await link.status()).toEqual(NO_WATCH);
  const listener = jest.fn();
  link.onCommand(listener)();
  link.sendState(STATE);
  expect(listener).not.toHaveBeenCalled();
});
