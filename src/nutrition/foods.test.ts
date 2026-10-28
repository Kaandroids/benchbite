import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { act, renderHook, waitFor } from '@/test/render';

import {
  amountOf,
  columnOf,
  foodColumns,
  pickedPortionOf,
  refKey,
  refOf,
  refOfRow,
  SEARCH_DELAY_MS,
  useFood,
  useFoodSearch,
  useSettledQuery,
} from './foods';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const OATS = { calories: 348, proteinG: 13.22, carbsG: 53.3, fatG: 6.65 };

describe('amountOf', () => {
  it('scales the values per 100 g to the grams', () => {
    expect(amountOf(OATS, 50)).toEqual({
      calories: 174,
      proteinG: 6.61,
      carbsG: 26.65,
      fatG: 3.325,
    });
  });
});

describe('refKey', () => {
  it('names a food as a route parameter and back', () => {
    expect(refKey({ kind: 'library', id: 'C133000' })).toBe('C133000');
    expect(refKey({ kind: 'custom', id: 12 })).toBe('custom-12');
    expect(refOf('custom-12')).toEqual({ kind: 'custom', id: 12 });
    expect(refOf('C133000')).toEqual({ kind: 'library', id: 'C133000' });
    expect(refKey({ kind: 'recipe', id: 3 })).toBe('recipe-3');
    expect(refOf('recipe-3')).toEqual({ kind: 'recipe', id: 3 });
  });
});

describe('pickedPortionOf', () => {
  it('gives the portions picked, or none when grams were entered', () => {
    expect(pickedPortionOf('bowl', 1.5)).toEqual({ unit: 'bowl', count: 1.5 });
    expect(pickedPortionOf(null, null)).toBeNull();
  });
});

describe('refOfRow and foodColumns', () => {
  it("name a library food, a food of one's own or a recipe, by exactly one column", () => {
    expect(refOfRow({ food_id: null, custom_food_id: null, recipe_id: 3 })).toEqual({
      kind: 'recipe',
      id: 3,
    });
    expect(refOfRow({ food_id: null, custom_food_id: 4, recipe_id: null })).toEqual({
      kind: 'custom',
      id: 4,
    });
    expect(columnOf({ kind: 'recipe', id: 3 })).toBe('recipe_id');
    expect(columnOf({ kind: 'custom', id: 4 })).toBe('custom_food_id');
    expect(columnOf({ kind: 'library', id: 'C133000' })).toBe('food_id');
    expect(foodColumns({ kind: 'recipe', id: 3 })).toEqual({
      food_id: null,
      custom_food_id: null,
      recipe_id: 3,
    });
    expect(foodColumns({ kind: 'library', id: 'C133000' })).toEqual({
      food_id: 'C133000',
      custom_food_id: null,
      recipe_id: null,
    });
  });
});

describe('useSettledQuery', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('follows what is typed once typing pauses', async () => {
    const { result, rerender } = await renderHook(({ query }) => useSettledQuery(query), {
      initialProps: { query: '' },
    });
    await rerender({ query: 'oa' });
    await rerender({ query: 'oat' });
    expect(result.current).toBe('');
    await act(() => jest.advanceTimersByTime(SEARCH_DELAY_MS));
    expect(result.current).toBe('oat');
  });
});

describe('useFoodSearch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('searches in the app language', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          food_id: 'C133000',
          custom_food_id: null,
          recipe_id: null,
          name: 'Oat flakes',
          kcal: 348,
          protein_g: 13.22,
          carbs_g: 53.3,
          fat_g: 6.65,
          portion_unit: 'serving',
          portion_grams: 50,
        },
      ],
      error: null,
    } as never);
    const { result } = await renderHook(() => useFoodSearch('oat'));
    await waitFor(() =>
      expect(result.current.data).toEqual([
        {
          ref: { kind: 'library', id: 'C133000' },
          name: 'Oat flakes',
          per100g: OATS,
          portion: { unit: 'serving', grams: 50 },
        },
      ]),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('search_foods', {
      query: 'oat',
      language: 'en',
      recipes: true,
    });
  });

  it("finds the user's own foods, which may have no portion", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          food_id: null,
          custom_food_id: 12,
          recipe_id: null,
          name: 'Protein yoghurt',
          kcal: 70,
          protein_g: 10,
          carbs_g: 6.5,
          fat_g: 0.3,
          portion_unit: null,
          portion_grams: null,
        },
      ],
      error: null,
    } as never);
    const { result } = await renderHook(() => useFoodSearch('protein'));
    await waitFor(() =>
      expect(result.current.data?.[0]).toEqual({
        ref: { kind: 'custom', id: 12 },
        name: 'Protein yoghurt',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portion: null,
      }),
    );
  });

  it('does not search below 2 characters', async () => {
    const { result } = await renderHook(() => useFoodSearch('o'));
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});

describe('useFood', () => {
  const maybeSingle = jest.fn();
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));

  beforeEach(() => jest.mocked(supabase.from).mockReturnValue({ select } as never));
  afterEach(() => act(() => i18n.changeLanguage('en')));

  const row = {
    id: 'C133000',
    kcal: 348,
    protein_g: 13.22,
    carbs_g: 53.3,
    fat_g: 6.65,
    archived_at: null,
    food_names: [
      { language: 'en', name: 'Oat flakes' },
      { language: 'de', name: 'Haferflocken' },
    ],
    food_portions: [
      { unit: 'tablespoon', grams: 10, is_default: false },
      { unit: 'serving', grams: 50, is_default: true },
    ],
  };

  it('loads the food with its name in the app language and the default portion first', async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });
    await act(() => i18n.changeLanguage('de'));
    const { result } = await renderHook(() => useFood({ kind: 'library', id: 'C133000' }));
    await waitFor(() =>
      expect(result.current.data).toEqual({
        ref: { kind: 'library', id: 'C133000' },
        name: 'Haferflocken',
        per100g: OATS,
        portions: [
          { unit: 'serving', grams: 50 },
          { unit: 'tablespoon', grams: 10 },
        ],
      }),
    );
    expect(supabase.from).toHaveBeenCalledWith('foods');
    expect(eq).toHaveBeenCalledWith('id', 'C133000');
  });

  it('falls back to the English name', async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });
    await act(() => i18n.changeLanguage('tr'));
    const { result } = await renderHook(() => useFood({ kind: 'library', id: 'C133000' }));
    await waitFor(() => expect(result.current.data?.name).toBe('Oat flakes'));
  });

  it('is null for a food taken out of the library', async () => {
    maybeSingle.mockResolvedValue({ data: { ...row, archived_at: '2026-10-27' }, error: null });
    const { result } = await renderHook(() => useFood({ kind: 'library', id: 'C133000' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("loads a food of the user's own with its portion", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 12,
        name: 'Protein yoghurt',
        kcal: 70,
        protein_g: 10,
        carbs_g: 6.5,
        fat_g: 0.3,
        portion_unit: 'serving',
        portion_grams: 200,
        archived_at: null,
      },
      error: null,
    });
    const { result } = await renderHook(() => useFood({ kind: 'custom', id: 12 }));
    await waitFor(() =>
      expect(result.current.data).toEqual({
        ref: { kind: 'custom', id: 12 },
        name: 'Protein yoghurt',
        per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
        portions: [{ unit: 'serving', grams: 200 }],
      }),
    );
    expect(supabase.from).toHaveBeenCalledWith('custom_foods');
  });

  it('is null for an unknown food', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = await renderHook(() => useFood({ kind: 'library', id: 'X' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useFood, for a recipe', () => {
  function mockRecipe(recipe: unknown, values: unknown) {
    jest.mocked(supabase.from).mockImplementation(
      (table) =>
        ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: String(table) === 'recipes' ? recipe : values,
                  error: null,
                }),
            }),
          }),
        }) as never,
    );
  }

  it('gives its values per 100 g and one serving as its portion', async () => {
    mockRecipe(
      { id: 3, name: 'Lentil soup', servings: 4, serving_unit: 'bowl', archived_at: null },
      { kcal: 67.8, protein_g: 4, carbs_g: 9.3, fat_g: 1.5, serving_grams: 400 },
    );
    const { result } = await renderHook(() => useFood({ kind: 'recipe', id: 3 }));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      ref: { kind: 'recipe', id: 3 },
      name: 'Lentil soup',
      per100g: { calories: 67.8, proteinG: 4, carbsG: 9.3, fatG: 1.5 },
      portions: [{ unit: 'bowl', grams: 400 }],
    });
  });

  it('gives nothing for a deleted recipe', async () => {
    mockRecipe(
      { id: 3, name: 'Lentil soup', servings: 4, serving_unit: 'bowl', archived_at: '2026-10-28' },
      { kcal: 67.8, protein_g: 4, carbs_g: 9.3, fat_g: 1.5, serving_grams: 400 },
    );
    const { result } = await renderHook(() => useFood({ kind: 'recipe', id: 3 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
