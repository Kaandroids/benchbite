import { useExerciseLibrary } from '@/exercises/library';
import { resetSessionStore, startSession, toggleDone, updateSession } from '@/sessions/session';
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

  await act(() => updateSession((current) => toggleDone(current, 0, 0, NOW)));
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

it('holds commands while the library loads, then applies them with its rules', async () => {
  startSession('user-a', PUSH, {}, { now: NOW });
  jest.mocked(useExerciseLibrary).mockReturnValue({ data: undefined, isPending: true } as never);
  const { rerender } = await render(<WatchSync />);
  const command = (id: string, body: Record<string, unknown>) => ({
    v: PROTOCOL_VERSION,
    id,
    at: NOW,
    workoutId: 'workout-1',
    exercise: 0,
    set: 0,
    ...body,
  });
  // A tick without a weight, which the bench press needs, and then the weight.
  await act(() => deliver(command('tick', { type: 'setDone', done: true })));
  await act(() => deliver(command('weight', { type: 'setValues', values: { weightKg: 60 } })));
  expect(lastSent().workout?.exercises[0]?.sets[0]).toMatchObject({ weightKg: null, done: false });

  jest.mocked(useExerciseLibrary).mockReturnValue(LOADED);
  await rerender(<WatchSync />);
  expect(lastSent().workout?.exercises[0]?.sets[0]).toMatchObject({ weightKg: 60, done: false });
  expect(lastSent().workout?.applied).toEqual(['tick', 'weight']);
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
  const { unmount } = await render(<WatchSync />);
  await unmount();
  expect(stopListening).toHaveBeenCalled();
});
