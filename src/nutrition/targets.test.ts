import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  targetsFrom,
  useCalculatedTargets,
  useDayTargets,
  useNutritionTargets,
  useOwnTargets,
  useRecalculateTargets,
  useSetOwnTargets,
  useTargetBasis,
  useUseCalculatedTargets,
} from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));

beforeEach(() => jest.mocked(useSession).mockReturnValue(sessionValue('user-1')));

const rpc = jest.mocked(supabase.rpc);

describe('targetsFrom', () => {
  it('names the targets the way the app does', () => {
    expect(targetsFrom({ calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70 })).toEqual({
      calories: 2200,
      proteinG: 150,
      carbsG: 250,
      fatG: 70,
    });
  });

  it('has no targets without calories, as before the onboarding is saved', () => {
    expect(targetsFrom({ calories: null, protein_g: null, carbs_g: null, fat_g: null })).toBeNull();
  });
});

describe('useNutritionTargets', () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads the user's targets", async () => {
    rpc.mockResolvedValue({
      data: { calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70 },
      error: null,
    } as never);
    const { result } = await renderHook(() => useNutritionTargets());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('my_nutrition_targets');
    expect(result.current.data).toEqual({ calories: 2200, proteinG: 150, carbsG: 250, fatG: 70 });
  });

  it('fails with the error the database returns', async () => {
    const error = { code: 'PGRST301', message: 'JWT expired' };
    rpc.mockResolvedValue({ data: null, error } as never);
    const { result } = await renderHook(() => useNutritionTargets());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});

describe('useCalculatedTargets', () => {
  it('loads the calculated targets, whichever are in use', async () => {
    rpc.mockResolvedValue({
      data: { calories: 1940, protein_g: 135, carbs_g: 229, fat_g: 54 },
      error: null,
    } as never);
    const { result } = await renderHook(() => useCalculatedTargets());
    await waitFor(() => expect(result.current.data?.calories).toBe(1940));
    expect(rpc).toHaveBeenCalledWith('calculated_nutrition_targets');
  });
});

describe('useOwnTargets', () => {
  it("loads the user's own targets and whether they are in use", async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { calories: 2200, protein_g: 160, carbs_g: 240, fat_g: 65, in_use: false },
      error: null,
    });
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ maybeSingle }) } as never);
    const { result } = await renderHook(() => useOwnTargets());
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      targets: { calories: 2200, proteinG: 160, carbsG: 240, fatG: 65 },
      inUse: false,
    });
  });
});

describe('useSetOwnTargets', () => {
  it('saves the targets in use and reloads every target', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.from).mockReturnValue({ upsert } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useSetOwnTargets(), { queryClient });
    await act(() =>
      result.current.mutateAsync({ calories: 2200, proteinG: 160, carbsG: 240, fatG: 65 }),
    );
    expect(upsert).toHaveBeenCalledWith(
      { calories: 2200, protein_g: 160, carbs_g: 240, fat_g: 65, in_use: true },
      { onConflict: 'user_id' },
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
  });
});

describe('useUseCalculatedTargets', () => {
  it("puts the calculated targets back in use, keeping the user's own", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const { result } = await renderHook(() => useUseCalculatedTargets());
    await act(() => result.current.mutateAsync());
    expect(update).toHaveBeenCalledWith({ in_use: false });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('useTargetBasis', () => {
  it('loads the goal and the activity the targets are worked out from', async () => {
    jest.mocked(supabase.from).mockImplementation(
      (table) =>
        ({
          select: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  String(table) === 'goals'
                    ? { kind: 'lose_fat', target_weight_kg: 75, weekly_pace_kg: 0.5 }
                    : { activity_level: 'light', height_cm: 180 },
                error: null,
              }),
          }),
        }) as never,
    );
    const { result } = await renderHook(() => useTargetBasis());
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      goal: 'lose_fat',
      targetWeightKg: 75,
      weeklyPaceKg: 0.5,
      activity: 'light',
      heightCm: 180,
    });
  });
});

describe('useRecalculateTargets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 9, 28, 1), doNotFake: ['nextTick'] });
  });
  afterEach(() => jest.useRealTimers());

  it('saves a goal that keeps the weight without a target or a pace', async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useRecalculateTargets(), { queryClient });
    await act(() =>
      result.current.mutateAsync({
        goal: 'stay_healthy',
        targetWeightKg: null,
        weeklyPaceKg: null,
        activity: 'moderate',
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(1, 'recalculate_nutrition_targets', {
      goal: 'stay_healthy',
      target_weight_kg: null,
      weekly_pace_kg: null,
      activity_level: 'moderate',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'refresh_day_nutrition_targets', {
      from_day: '2026-10-28',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
  });

  it('reloads the targets when today cannot follow, as the answers are saved', async () => {
    rpc.mockImplementation(((name: string) =>
      Promise.resolve({
        data: null,
        error: name === 'refresh_day_nutrition_targets' ? { code: '22023' } : null,
      })) as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useRecalculateTargets(), { queryClient });
    await act(() =>
      result.current.mutate({
        goal: 'lose_fat',
        targetWeightKg: 75,
        weeklyPaceKg: 0.5,
        activity: 'light',
      }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpc).toHaveBeenCalledWith('refresh_day_nutrition_targets', { from_day: '2026-10-28' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
  });

  it('reloads own targets too when today cannot follow them', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023' } } as never);
    jest
      .mocked(supabase.from)
      .mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useSetOwnTargets(), { queryClient });
    await act(() =>
      result.current.mutate({ calories: 3100, proteinG: 150, carbsG: 425, fatG: 80 }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['nutrition-targets'] });
  });

  it('keeps today as it was when the answers are refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'BB031' } } as never);
    const { result } = await renderHook(() => useRecalculateTargets());
    await expect(
      act(() =>
        result.current.mutateAsync({
          goal: 'lose_fat',
          targetWeightKg: 85,
          weeklyPaceKg: 0.5,
          activity: 'light',
        }),
      ),
    ).rejects.toEqual({ code: 'BB031' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('useDayTargets', () => {
  // 1 AM on the device, which may still be the day before on the server.
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 28, 1), doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it("asks the database for a day's targets, saying which day is today on the device", async () => {
    rpc.mockResolvedValue({
      data: { calories: 2800, protein_g: 150, carbs_g: 350, fat_g: 80 },
      error: null,
    } as never);
    const { result } = await renderHook(() => useDayTargets('2026-10-27'));
    await waitFor(() => expect(result.current.data?.calories).toBe(2800));
    expect(rpc).toHaveBeenCalledWith('targets_of_day', {
      on_day: '2026-10-27',
      today: '2026-10-28',
    });
  });
});

describe('changing the targets in use', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 28, 1), doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('writes own targets over today and the days after it', async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    jest
      .mocked(supabase.from)
      .mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) } as never);
    const { result } = await renderHook(() => useSetOwnTargets());
    await act(() =>
      result.current.mutateAsync({ calories: 3100, proteinG: 150, carbsG: 425, fatG: 80 }),
    );
    expect(rpc).toHaveBeenCalledWith('refresh_day_nutrition_targets', { from_day: '2026-10-28' });
  });

  it('writes the calculated targets over today when they are back in use', async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    const eq = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.from).mockReturnValue({ update: () => ({ eq }) } as never);
    const { result } = await renderHook(() => useUseCalculatedTargets());
    await act(() => result.current.mutateAsync());
    expect(rpc).toHaveBeenCalledWith('refresh_day_nutrition_targets', { from_day: '2026-10-28' });
  });

  it('fails when today cannot follow, so that the change is tried again', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023' } } as never);
    jest
      .mocked(supabase.from)
      .mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) } as never);
    const { result } = await renderHook(() => useSetOwnTargets());
    await expect(
      act(() =>
        result.current.mutateAsync({ calories: 3100, proteinG: 150, carbsG: 425, fatG: 80 }),
      ),
    ).rejects.toEqual({ code: '22023' });
  });
});
