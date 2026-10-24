import { router } from 'expo-router';

import { act, createTestQueryClient, renderHook } from '@/test/render';
import type { Workout } from '@/workouts/workouts';

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

// Wednesday, October 21.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const PUSH: Workout = {
  id: 1,
  name: 'Push',
  type: null,
  weekdays: [1],
  active: true,
  estimatedMinutes: 45,
  exercises: [],
};

const askMove = jest.fn();

async function start(options?: { beforeStart?: () => void }) {
  jest.mocked(useStartMove).mockReturnValue(askMove);
  const { result } = await renderHook(() => useStartWorkout(), {
    queryClient: createTestQueryClient(),
  });
  await act(() => result.current(PUSH, options));
}

describe('useStartWorkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      },
    );
    expect(router.push).toHaveBeenCalledWith('/session');
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
});
