import { router } from 'expo-router';

import { renderHook } from '@/test/render';

import { type ChoiceAlternative, firstAlternative, useAskWhatStays } from './choice';
import { useWorkoutLimits } from './workouts';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkoutLimits: jest.fn(),
}));

const alternative = (id: number, held = false): ChoiceAlternative => ({
  id,
  workoutId: 1,
  position: 2,
  name: null,
  held,
  lastUsedAt: null,
});

beforeEach(() => jest.clearAllMocks());

describe('useAskWhatStays', () => {
  it('opens the choice while it is the user’s to make', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue({ data: { choice_open: true } } as never);
    await renderHook(() => useAskWhatStays());
    expect(router.push).toHaveBeenCalledWith('/workout/choose');
  });

  it('opens nothing otherwise', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue({ data: { choice_open: false } } as never);
    await renderHook(() => useAskWhatStays());
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('firstAlternative', () => {
  it('starts from the one that stays now', () => {
    expect(firstAlternative([alternative(1, true), alternative(2)])).toBe(2);
  });

  it('or the one last used, which comes first', () => {
    expect(firstAlternative([alternative(1, true), alternative(2, true)])).toBe(1);
  });

  it('has none without any', () => {
    expect(firstAlternative([])).toBeUndefined();
  });
});
