import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import { useCreateFood, useDeleteFood, useUpdateFood, type CustomFoodValues } from './custom-foods';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const YOGHURT: CustomFoodValues = {
  name: 'Protein yoghurt',
  per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
  portion: { unit: 'serving', grams: 200 },
};

const COLUMNS = {
  name: 'Protein yoghurt',
  kcal: 70,
  protein_g: 10,
  carbs_g: 6.5,
  fat_g: 0.3,
  portion_unit: 'serving',
  portion_grams: 200,
};

beforeEach(() => jest.clearAllMocks());

describe('useCreateFood', () => {
  it('adds the food, gives its id and reloads search', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 12 }, error: null });
    const insert = jest.fn(() => ({ select: () => ({ single }) }));
    jest.mocked(supabase.from).mockReturnValue({ insert } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useCreateFood(), { queryClient });
    let id: number | undefined;
    await act(async () => {
      id = await result.current.mutateAsync(YOGHURT);
    });
    expect(id).toBe(12);
    expect(supabase.from).toHaveBeenCalledWith('custom_foods');
    expect(insert).toHaveBeenCalledWith(COLUMNS);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['food-search'] });
  });
});

describe('useUpdateFood', () => {
  it('changes the food', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const { result } = await renderHook(() => useUpdateFood());
    await act(() => result.current.mutateAsync({ id: 12, values: { ...YOGHURT, portion: null } }));
    expect(update).toHaveBeenCalledWith({ ...COLUMNS, portion_unit: null, portion_grams: null });
    expect(eq).toHaveBeenCalledWith('id', 12);
  });
});

describe('useDeleteFood', () => {
  it('archives the food', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const { result } = await renderHook(() => useDeleteFood());
    await act(() => result.current.mutateAsync(12));
    expect(update).toHaveBeenCalledWith({ archived_at: expect.any(String) });
    expect(eq).toHaveBeenCalledWith('id', 12);
  });
});
