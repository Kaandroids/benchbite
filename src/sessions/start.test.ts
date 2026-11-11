import { router } from 'expo-router';
import { Alert } from 'react-native';

import { act, createTestQueryClient, renderHook } from '@/test/render';
import { openOnWatch } from '@/watch/open-on-watch';
import { startsOnWatch } from '@/watch/start-on-watch';
import { testExercise } from '@/workouts/test-data';
import { fetchWorkoutHeld, reloadPlan, type Workout } from '@/workouts/workouts';

import { startSession } from './session';
import { useStartWorkout } from './start';
import { useStartMove } from './start-move';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('./logs', () => ({
  fetchLastSets: jest.fn().mockResolvedValue({}),
  fetchBests: jest.fn().mockResolvedValue({}),
}));
jest.mock('./rest-alarm', () => ({ offerRestAlarm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./session', () => ({ startSession: jest.fn() }));
jest.mock('./start-move', () => ({ useStartMove: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/watch/start-on-watch', () => ({ startsOnWatch: jest.fn() }));
jest.mock('@/watch/open-on-watch', () => ({ openOnWatch: jest.fn() }));
jest.mock('@/workouts/workouts', () => ({
  fetchWorkoutHeld: jest.fn(),
  reloadPlan: jest.fn(),
}));

// Wednesday, October 21.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const PUSH: Workout = {
  id: 1,
  name: 'Push',
  type: null,
  weekdays: [1],
  active: true,
  held: false,
  estimatedMinutes: 45,
  exercises: [testExercise('bench')],
};

const askMove = jest.fn();
const SESSION = { id: 'session-a', startedAt: WEDNESDAY.getTime() };

async function start(options?: { beforeStart?: () => void }, workout = PUSH) {
  jest.mocked(useStartMove).mockReturnValue(askMove);
  const { result } = await renderHook(() => useStartWorkout(), {
    queryClient: createTestQueryClient(),
  });
  await act(() => result.current(workout, options));
}

describe('useStartWorkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchWorkoutHeld).mockResolvedValue(false);
    jest.mocked(startsOnWatch).mockResolvedValue(false);
    jest.mocked(startSession).mockReturnValue(SESSION as ReturnType<typeof startSession>);
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  });
  afterEach(() => jest.useRealTimers());

  it('starts a workout moved from a planned day with its move, dated the day it starts', async () => {
    askMove.mockResolvedValue({ fromOn: '2026-10-19' });
    await start();
    expect(askMove).toHaveBeenCalledWith(PUSH, expect.any(Date));
    expect(startSession).toHaveBeenCalledWith(
      'user-a',
      PUSH,
      {},
      {
        bests: {},
        now: WEDNESDAY.getTime(),
        move: { from: '2026-10-19', to: '2026-10-21' },
        watchFollows: false,
      },
    );
    expect(router.push).toHaveBeenCalledWith('/session');
    expect(openOnWatch).not.toHaveBeenCalled();
  });

  it('starts on the watch too when the user chose it, and opens Benchbite there', async () => {
    askMove.mockResolvedValue({});
    jest.mocked(startsOnWatch).mockResolvedValue(true);
    await start();
    expect(startSession).toHaveBeenCalledWith(
      'user-a',
      PUSH,
      {},
      expect.objectContaining({ watchFollows: true }),
    );
    expect(openOnWatch).toHaveBeenCalledWith(SESSION);
  });

  it('asks about the watch only once the workout is sure to start', async () => {
    askMove.mockResolvedValue(null);
    await start();
    expect(startsOnWatch).not.toHaveBeenCalled();
  });

  it('does not start when the question about the watch is closed', async () => {
    const beforeStart = jest.fn();
    askMove.mockResolvedValue({});
    jest.mocked(startsOnWatch).mockResolvedValue(null);
    await start({ beforeStart });
    expect(beforeStart).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('starts an extra workout without a move', async () => {
    askMove.mockResolvedValue({});
    await start();
    expect(startSession).toHaveBeenCalledWith(
      'user-a',
      PUSH,
      {},
      expect.objectContaining({ move: undefined }),
    );
  });

  it('ends the workout it replaces only once it is sure to start', async () => {
    const beforeStart = jest.fn();
    askMove.mockResolvedValue(null);
    await start({ beforeStart });
    expect(beforeStart).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();

    askMove.mockResolvedValue({});
    await start({ beforeStart });
    expect(beforeStart).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalled();
  });

  it('opens a workout without exercises instead of starting it', async () => {
    const beforeStart = jest.fn();
    await start({ beforeStart }, { ...PUSH, exercises: [] });
    expect(askMove).not.toHaveBeenCalled();
    expect(beforeStart).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/[id]', params: { id: '1' } });
  });

  it('does not start a workout that waits for premium since the list was loaded', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const beforeStart = jest.fn();
    jest.mocked(fetchWorkoutHeld).mockResolvedValue(true);
    await start({ beforeStart });
    expect(fetchWorkoutHeld).toHaveBeenCalledWith(1);
    expect(alert).toHaveBeenCalledWith(
      'Push waits for premium',
      'Nothing is deleted. It comes back as it was with premium.',
      expect.any(Array),
    );
    expect(reloadPlan).toHaveBeenCalled();
    expect(askMove).not.toHaveBeenCalled();
    expect(beforeStart).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('starts as the list shows it without a connection', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(fetchWorkoutHeld).mockRejectedValue(new TypeError('Network request failed'));
    askMove.mockResolvedValue({});
    await start();
    expect(startSession).toHaveBeenCalled();
    expect(reloadPlan).not.toHaveBeenCalled();
  });
});
