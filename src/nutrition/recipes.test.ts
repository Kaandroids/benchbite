import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  recipeTotals,
  useDeleteRecipe,
  useRecipe,
  useRecipes,
  useSaveRecipe,
  type Ingredient,
} from './recipes';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const LENTILS: Ingredient = {
  food: { kind: 'library', id: 'H801000' },
  name: 'Red lentils, dry',
  per100g: { calories: 337, proteinG: 24, carbsG: 50, fatG: 1.5 },
  grams: 250,
  portion: null,
};

const STOCK: Ingredient = {
  food: { kind: 'custom', id: 4 },
  name: 'Stock',
  per100g: { calories: 10, proteinG: 1, carbsG: 0.5, fatG: 0.4 },
  grams: 1000,
  portion: { unit: 'glass', count: 5 },
};

describe('recipeTotals', () => {
  it('sums the ingredients and shares them out by the servings', () => {
    const totals = recipeTotals({ servings: 4, ingredients: [LENTILS, STOCK] });
    expect(totals.grams).toBe(1250);
    expect(totals.servingGrams).toBe(312.5);
    expect(totals.total.calories).toBeCloseTo(942.5);
    expect(totals.serving.calories).toBeCloseTo(235.6, 1);
    expect(totals.serving.proteinG).toBeCloseTo(17.5);
  });

  it('is nothing without ingredients', () => {
    expect(recipeTotals({ servings: 1, ingredients: [] }).serving.calories).toBe(0);
  });
});

describe('useRecipe', () => {
  function mockRow(row: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    jest
      .mocked(supabase.from)
      .mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) } as never);
  }

  it('loads a recipe with its ingredients in order, named and with their values', async () => {
    mockRow({
      id: 3,
      name: 'Lentil soup',
      servings: 4,
      serving_unit: 'bowl',
      archived_at: null,
      recipe_ingredients: [
        {
          position: 1,
          food_id: null,
          custom_food_id: 4,
          grams: 1000,
          portion_unit: 'glass',
          portion_count: 5,
          foods: null,
          custom_foods: { name: 'Stock', kcal: 10, protein_g: 1, carbs_g: 0.5, fat_g: 0.4 },
        },
        {
          position: 0,
          food_id: 'H801000',
          custom_food_id: null,
          grams: 250,
          portion_unit: null,
          portion_count: null,
          foods: {
            kcal: 337,
            protein_g: 24,
            carbs_g: 50,
            fat_g: 1.5,
            food_names: [{ language: 'en', name: 'Red lentils, dry' }],
          },
          custom_foods: null,
        },
      ],
    });
    const { result } = await renderHook(() => useRecipe(3));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      id: 3,
      name: 'Lentil soup',
      servings: 4,
      servingUnit: 'bowl',
      ingredients: [LENTILS, STOCK],
    });
  });

  it('gives nothing for a deleted recipe', async () => {
    mockRow({ id: 3, archived_at: '2026-10-28', recipe_ingredients: [] });
    const { result } = await renderHook(() => useRecipe(3));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useRecipes', () => {
  it("lists the user's recipes that can be logged, by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          food_id: null,
          custom_food_id: null,
          recipe_id: 3,
          name: 'Lentil soup',
          kcal: 67.8,
          protein_g: 4,
          carbs_g: 9.3,
          fat_g: 1.5,
          portion_unit: 'bowl',
          portion_grams: 400,
        },
      ],
      error: null,
    });
    const not = jest.fn(() => ({ order }));
    jest.mocked(supabase.rpc).mockReturnValue({ not } as never);
    const { result } = await renderHook(() => useRecipes());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(supabase.rpc).toHaveBeenCalledWith('loggable_foods', { language: 'en' });
    expect(not).toHaveBeenCalledWith('recipe_id', 'is', null);
    expect(result.current.data?.[0]).toMatchObject({
      ref: { kind: 'recipe', id: 3 },
      portion: { unit: 'bowl', grams: 400 },
    });
  });
});

describe('useSaveRecipe', () => {
  it('saves a recipe with its ingredients in one step and reloads what shows it', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 3, error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useSaveRecipe(), { queryClient });
    let id;
    await act(async () => {
      id = await result.current.mutateAsync({
        values: {
          name: 'Lentil soup',
          servings: 4,
          servingUnit: 'bowl',
          ingredients: [LENTILS, STOCK],
        },
      });
    });
    expect(id).toBe(3);
    expect(supabase.rpc).toHaveBeenCalledWith('save_recipe', {
      recipe_id: null,
      name: 'Lentil soup',
      servings: 4,
      serving_unit: 'bowl',
      ingredients: [
        { food_id: 'H801000', grams: 250, portion_unit: null, portion_count: null },
        { custom_food_id: 4, grams: 1000, portion_unit: 'glass', portion_count: 5 },
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['recipes'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['food-search'] });
  });

  it('fails with what the database refused', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'BB028' } } as never);
    const { result } = await renderHook(() => useSaveRecipe());
    await expect(
      act(() =>
        result.current.mutateAsync({
          id: 3,
          values: { name: 'X', servings: 1, servingUnit: 'bowl', ingredients: [LENTILS] },
        }),
      ),
    ).rejects.toEqual({ code: 'BB028' });
  });
});

describe('useDeleteRecipe', () => {
  it('archives the recipe', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const { result } = await renderHook(() => useDeleteRecipe());
    await act(() => result.current.mutateAsync(3));
    expect(supabase.from).toHaveBeenCalledWith('recipes');
    expect(update).toHaveBeenCalledWith({ archived_at: expect.any(String) });
    expect(eq).toHaveBeenCalledWith('id', 3);
  });
});
