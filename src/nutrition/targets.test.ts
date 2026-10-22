import { supabase } from '@/lib/supabase';
import { renderHook, waitFor } from '@/test/render';

import { targetsFrom, useNutritionTargets } from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

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
