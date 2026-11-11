import { router } from 'expo-router';

import { useExerciseLibrary } from '@/exercises/library';
import { supabase } from '@/lib/supabase';
import {
  endSession,
  resetSessionStore,
  startClock,
  startSession,
  toggleDoneUnchecked,
  updateSession,
} from '@/sessions/session';
import { act, render } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { link } from './link';
import { openOnWatch } from './open-on-watch';
import { PROTOCOL_VERSION, type WatchState } from './protocol';
import { WatchSync } from './watch-sync';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-router', () => ({
  router: { dismissAll: jest.fn() },
  usePathname: () => '/session',
}));
jest.mock('@/health/health-catch-up', () => ({ afterWorkoutLogged: jest.fn() }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
const mockSignIn = { status: 'ready' as 'ready' | 'loading' };
jest.mock('@/providers/session-provider', () => ({
  useUserId: () => (mockSignIn.status === 'ready' ? 'user-a' : undefined),
  useSession: () => mockSignIn,
}));
jest.mock('./link', () => ({
  link: {
    status: jest.fn(),
    onStatusChange: jest.fn(() => () => undefined),
    sendState: jest.fn(),
    onCommand: jest.fn(),
    startWatchApp: jest.fn(),
  },
}));

const NOW = 1_800_000_000_000;
const PUSH = testWorkout(7, { exercises: [testExercise('bench', { sets: 3, restSeconds: 90 })] });

const LOADED = {
  data: [{ id: 'bench', name: 'Bench press', metrics: ['weight', 'reps'] }],
  isPending: false,
} as never;

let deliver: (message: unknown) => void = () => undefined;
const stopListening = jest.fn();
const sent = () => jest.mocked(link.sendState).mock.calls.map(([state]) => state);
const lastSent = (): WatchState => sent()[sent().length - 1]!;

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = 'ready';
  jest.useFakeTimers({ now: NOW });
  jest.mocked(useExerciseLibrary).mockReturnValue(LOADED);
  jest.mocked(link.onCommand).mockImplementation((listener) => {
    deliver = listener;
    return stopListening;
  });
  resetSessionStore();
});
afterEach(() => jest.useRealTimers());

it('sends the workout to the watch, and each change of it', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  await render(<WatchSync />);
  expect(lastSent().workout?.exercises[0]?.name).toBe('Bench press');
  // Named as the phone names it: by its type, without a name of its own.
  expect(lastSent().workout?.name).toBe('Full body');

  await act(() => updateSession((current) => toggleDoneUnchecked(current, 0, 0, NOW)));
  expect(lastSent().workout?.exercises[0]?.sets[0]?.done).toBe(true);
  // Each state is newer than the one before.
  const seqs = sent().map((state) => state.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(new Set(seqs).size).toBe(seqs.length);
});

it('opens Benchbite on the watch for a workout started there too, once it is sent', async () => {
  await render(<WatchSync />);
  await act(() => {
    const session = startSession('user-a', PUSH, {}, { now: NOW, watchFollows: true });
    openOnWatch(session);
  });
  expect(link.startWatchApp).toHaveBeenCalledTimes(1);
  const opened = jest.mocked(link.startWatchApp!).mock.invocationCallOrder[0]!;
  const sentFollowing = jest
    .mocked(link.sendState)
    .mock.calls.findIndex(([state]) => state.workout?.follows);
  expect(jest.mocked(link.sendState).mock.invocationCallOrder[sentFollowing]).toBeLessThan(opened);

  await act(() => updateSession((current) => toggleDoneUnchecked(current, 0, 0, NOW)));
  expect(link.startWatchApp).toHaveBeenCalledTimes(1);
});

it('tells the watch when no workout runs', async () => {
  await render(<WatchSync />);
  expect(lastSent().workout).toBeNull();
});

it('says nothing to the watch until sign-in is known', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  mockSignIn.status = 'loading';
  const { rerender } = await render(<WatchSync />);
  // No workout would show yet, which the watch would take for one let go of.
  expect(link.sendState).not.toHaveBeenCalled();
  mockSignIn.status = 'ready';
  await rerender(<WatchSync />);
  expect(lastSent().workout?.id).toBe('workout-1');
});

it('tells the watch how the workout it followed ended', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  await render(<WatchSync />);
  await act(() => endSession({ saved: true, endedAt: NOW + 60_000 }));
  expect(lastSent()).toMatchObject({
    workout: null,
    ended: [{ id: 'workout-1', saved: true, endedAt: NOW + 60_000 }],
  });
});

it('applies the watch’s commands to the workout, and sends it back', async () => {
  // Last time's weight fills the sets, so that they can be ticked.
  const last = { bench: [{ weightKg: 80, reps: 8, seconds: null, meters: null }] };
  startSession('user-a', PUSH, last, { now: NOW });
  await render(<WatchSync />);
  await act(() =>
    deliver({
      v: PROTOCOL_VERSION,
      id: 'command-1',
      at: NOW,
      workoutId: 'workout-1',
      type: 'setDone',
      exercise: 0,
      set: 1,
      done: true,
    }),
  );
  expect(lastSent().workout?.exercises[0]?.sets[1]?.done).toBe(true);
  expect(lastSent().workout?.applied).toEqual(['command-1']);
});

const command = (id: string, body: Record<string, unknown>) => ({
  v: PROTOCOL_VERSION,
  id,
  at: NOW,
  workoutId: 'workout-1',
  exercise: 0,
  set: 0,
  ...body,
});

describe('a workout finished on the watch', () => {
  const last = { bench: [{ weightKg: 80, reps: 8, seconds: null, meters: null }] };
  const finish = (id = 'finish-1') => command(id, { type: 'finish', at: NOW + 60_000 });

  it('is saved at once and ended, closing the workout on the phone', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 12, error: null } as never);
    startSession('user-a', PUSH, last, { now: NOW, watchFollows: true });
    updateSession((current) => toggleDoneUnchecked(current, 0, 0, NOW + 30_000));
    await render(<WatchSync />);
    // It arrives a minute after the finish.
    jest.setSystemTime(NOW + 120_000);
    await act(async () => deliver(finish()));
    expect(supabase.rpc).toHaveBeenCalledWith('log_workout', {
      log: expect.objectContaining({ finishedAt: new Date(NOW + 60_000).toISOString() }),
    });
    expect(lastSent()).toMatchObject({
      workout: null,
      ended: [{ id: 'workout-1', saved: true, endedAt: NOW + 60_000 }],
    });
    expect(router.dismissAll).toHaveBeenCalled();
  });

  it('goes on when it cannot be saved, which the watch hears of', async () => {
    jest
      .mocked(supabase.rpc)
      .mockResolvedValue({ data: null, error: new Error('offline') } as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    startSession('user-a', PUSH, last, { now: NOW, watchFollows: true });
    updateSession((current) => toggleDoneUnchecked(current, 0, 0, NOW + 30_000));
    await render(<WatchSync />);
    await act(async () => deliver(finish()));
    expect(lastSent().workout?.applied).toEqual(['finish-1']);
    expect(router.dismissAll).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is not saved without a set done, nor twice', async () => {
    startSession('user-a', PUSH, last, { now: NOW, watchFollows: true });
    await render(<WatchSync />);
    await act(async () => deliver(finish()));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(lastSent().workout?.applied).toEqual(['finish-1']);
    // Delivered again, as a message that is also sent as a transfer.
    await act(async () => deliver(finish()));
    expect(lastSent().workout?.applied).toEqual(['finish-1']);
  });

  it('is saved with the set its clock times as its only work', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 12, error: null } as never);
    startSession('user-a', PUSH, last, { now: NOW, watchFollows: true });
    updateSession((current) => startClock(current, 0, 0, NOW + 30_000));
    await render(<WatchSync />);
    jest.setSystemTime(NOW + 120_000);
    await act(async () => deliver(finish()));
    expect(supabase.rpc).toHaveBeenCalledWith('log_workout', {
      log: expect.objectContaining({
        exercises: [{ exerciseId: 'bench', sets: [expect.objectContaining({ seconds: 30 })] }],
      }),
    });
    expect(lastSent().workout).toBeNull();
  });

  it('is saved once when delivered again while it is saved', async () => {
    let respond: (value: unknown) => void = () => undefined;
    jest
      .mocked(supabase.rpc)
      .mockReturnValue(new Promise((resolve) => (respond = resolve)) as never);
    startSession('user-a', PUSH, last, { now: NOW, watchFollows: true });
    updateSession((current) => toggleDoneUnchecked(current, 0, 0, NOW + 30_000));
    await render(<WatchSync />);
    await act(async () => deliver(finish()));
    await act(async () => deliver(finish()));
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    await act(async () => respond({ data: 12, error: null }));
    expect(lastSent().workout).toBeNull();
  });

  it('is saved when the app runs again, if it was ended before saving it', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 12, error: null } as never);
    startSession('user-a', PUSH, last, { now: NOW, watchFollows: true });
    updateSession((current) => ({
      ...toggleDoneUnchecked(current, 0, 0, NOW + 30_000),
      watchFinish: { id: 'finish-1', at: NOW + 60_000 },
    }));
    await render(<WatchSync />);
    await act(async () => undefined);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(lastSent()).toMatchObject({ workout: null, ended: [{ saved: true }] });
  });
});

it('sends the workout and takes commands once the library has loaded, with its rules', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  const loading = { data: undefined, isPending: true, failureCount: 0 } as never;
  jest.mocked(useExerciseLibrary).mockReturnValue(loading);
  const { rerender } = await render(<WatchSync />);
  // Its sets are not judged without the library, which would offer a Done the phone refuses.
  expect(link.sendState).not.toHaveBeenCalled();
  // They wait on the native side, which keeps them even when the app is ended meanwhile.
  expect(link.onCommand).not.toHaveBeenCalled();

  jest.mocked(useExerciseLibrary).mockReturnValue(LOADED);
  await rerender(<WatchSync />);
  expect(lastSent().workout?.exercises[0]?.sets[0]?.missing).toEqual(['weightKg']);
  expect(link.onCommand).toHaveBeenCalledTimes(1);
  // A tick without a weight, which the bench press needs, is refused; with it, it applies.
  await act(() => deliver(command('early tick', { type: 'setDone', done: true })));
  await act(() => deliver(command('weight', { type: 'setValues', values: { weightKg: 60 } })));
  await act(() => deliver(command('tick', { type: 'setDone', done: true })));
  expect(lastSent().workout?.exercises[0]?.sets[0]).toMatchObject({ weightKg: 60, done: true });
  expect(lastSent().workout?.applied).toEqual(['early tick', 'weight', 'tick']);
});

it('takes no commands without a workout', async () => {
  await render(<WatchSync />);
  expect(link.onCommand).not.toHaveBeenCalled();
});

it('applies commands at once when the library could not be read, as offline', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  const offline = { data: undefined, isPending: true, failureCount: 1 } as never;
  jest.mocked(useExerciseLibrary).mockReturnValue(offline);
  await render(<WatchSync />);
  await act(() => deliver(command('tick', { type: 'setDone', done: true })));
  // Without the library, a weight is not asked for, as on the phone's own screen.
  expect(lastSent().workout?.exercises[0]?.sets[0]?.done).toBe(true);
});

it('drops a message that is not a command', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  startSession('user-a', PUSH, {}, { now: NOW });
  await render(<WatchSync />);
  const before = sent().length;
  await act(() => deliver({ type: 'setDone' }));
  expect(sent()).toHaveLength(before);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

it('stops listening when it goes', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  const { unmount } = await render(<WatchSync />);
  await unmount();
  expect(stopListening).toHaveBeenCalled();
});
