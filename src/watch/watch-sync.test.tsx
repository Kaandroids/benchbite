import { useExerciseLibrary } from '@/exercises/library';
import {
  resetSessionStore,
  startSession,
  toggleDoneUnchecked,
  updateSession,
} from '@/sessions/session';
import { act, render } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { link } from './link';
import { PROTOCOL_VERSION, type WatchState } from './protocol';
import { WatchSync } from './watch-sync';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'workout-1' }));
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: { getItemSync: () => null, setItemSync: () => undefined },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('./link', () => ({
  link: {
    status: jest.fn(),
    onStatusChange: jest.fn(() => () => undefined),
    sendState: jest.fn(),
    onCommand: jest.fn(),
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

it('tells the watch when no workout runs', async () => {
  await render(<WatchSync />);
  expect(lastSent().workout).toBeNull();
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
