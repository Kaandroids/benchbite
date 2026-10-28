import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { sessionValue } from '@/test/context-mocks';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  targetsFrom,
  useCalculatedTargets,
  useNutritionTargets,
  useOwnTargets,
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
                    : { activity_level: 'light' },
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
    });
  });
});
