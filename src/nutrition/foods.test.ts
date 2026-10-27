import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import {
  amountOf,
  SEARCH_DELAY_MS,
  useAddEntry,
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
          id: 'C133000',
          name: 'Oat flakes',
          per100g: OATS,
          portion: { unit: 'serving', grams: 50 },
        },
      ]),
    );
    expect(supabase.rpc).toHaveBeenCalledWith('search_foods', { query: 'oat', language: 'en' });
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
    const { result } = await renderHook(() => useFood('C133000'));
    await waitFor(() =>
      expect(result.current.data).toEqual({
        id: 'C133000',
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
    const { result } = await renderHook(() => useFood('C133000'));
    await waitFor(() => expect(result.current.data?.name).toBe('Oat flakes'));
  });

  it('is null for a food taken out of the library', async () => {
    maybeSingle.mockResolvedValue({ data: { ...row, archived_at: '2026-10-27' }, error: null });
    const { result } = await renderHook(() => useFood('C133000'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('is null for an unknown food', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = await renderHook(() => useFood('X'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useAddEntry', () => {
  const insert = jest.fn();

  beforeEach(() => jest.mocked(supabase.from).mockReturnValue({ insert } as never));

  it("logs the food and loads the day's entries again", async () => {
    insert.mockResolvedValue({ error: null });
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useAddEntry(), { queryClient });
    await act(() =>
      result.current.mutateAsync({
        day: '2026-10-27',
        meal: 'breakfast',
        foodId: 'C133000',
        grams: 100,
        portion: { unit: 'serving', count: 2 },
      }),
    );
    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(insert).toHaveBeenCalledWith({
      day: '2026-10-27',
      meal: 'breakfast',
      food_id: 'C133000',
      grams: 100,
      portion_unit: 'serving',
      portion_count: 2,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-27'] });
  });

  it('logs grams without a portion', async () => {
    insert.mockResolvedValue({ error: null });
    const { result } = await renderHook(() => useAddEntry());
    await act(() =>
      result.current.mutateAsync({
        day: '2026-10-27',
        meal: 'snack',
        foodId: 'C133000',
        grams: 35,
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ grams: 35, portion_unit: null, portion_count: null }),
    );
  });

  it('fails with the error of the request', async () => {
    insert.mockResolvedValue({ error: { code: 'BB020' } });
    const { result } = await renderHook(() => useAddEntry());
    await expect(
      act(() =>
        result.current.mutateAsync({ day: '2026-10-01', meal: 'snack', foodId: 'X', grams: 1 }),
      ),
    ).rejects.toEqual({ code: 'BB020' });
  });
});
