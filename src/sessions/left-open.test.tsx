import { router } from 'expo-router';

import { act, fireEvent, render, screen } from '@/test/render';
import { testExercise, testWorkout } from '@/workouts/test-data';

import { LeftOpenSaver } from './left-open';
import { useLogWorkout } from './logs';
import {
  MAX_WORKOUT_MS,
  resetSessionStore,
  startSession,
  toggleDone,
  updateSession,
} from './session';

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
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('./logs', () => ({ useLogWorkout: jest.fn() }));

const NOW = new Date(2026, 9, 23, 18, 0).getTime();
const PUSH = testWorkout(4, { type: 'push', exercises: [testExercise('bench', { sets: 2 })] });
const logWorkout = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  resetSessionStore();
  startSession('user-a', PUSH, {}, { now: NOW });
  jest.mocked(useLogWorkout).mockReturnValue({ mutateAsync: logWorkout } as never);
  logWorkout.mockResolvedValue(42);
});
afterEach(() => jest.useRealTimers());

describe('LeftOpenSaver', () => {
  it('saves a workout left open at its last set and says so', async () => {
    updateSession((session) => toggleDone(session, 0, 0, NOW + 45 * 60_000));
    jest.setSystemTime(NOW + MAX_WORKOUT_MS + 60_000);
    await render(<LeftOpenSaver />);
    await act(async () => undefined);
    expect(logWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ finishedAt: new Date(NOW + 45 * 60_000).toISOString() }),
    );
    expect(screen.getByText('Push was saved')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'View' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/log/[id]',
      params: { id: '42' },
    });
  });

  it('leaves a workout alone while it can still be finished, or with nothing done', async () => {
    jest.setSystemTime(NOW + 60 * 60_000);
    updateSession((session) => toggleDone(session, 0, 0, NOW + 10 * 60_000));
    await render(<LeftOpenSaver />);
    await act(async () => undefined);
    expect(logWorkout).not.toHaveBeenCalled();

    resetSessionStore();
    startSession('user-a', PUSH, {}, { now: NOW });
    jest.setSystemTime(NOW + MAX_WORKOUT_MS + 60_000);
    await render(<LeftOpenSaver />);
    await act(async () => undefined);
    expect(logWorkout).not.toHaveBeenCalled();
  });
});
