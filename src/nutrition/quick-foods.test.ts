import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';
import { act, createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { useFavouriteFoods, useFrequentFoods, useMyFoods, useSetFavourite } from './quick-foods';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const values = { kcal: 348, protein_g: 13.2, carbs_g: 53.3, fat_g: 6.7 };

afterEach(() => act(() => i18n.changeLanguage('en')));

describe('useFrequentFoods', () => {
  it("loads a meal's frequent foods in the language, with the amount logged last", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          food_id: 'C133000',
          custom_food_id: null,
          name: 'Haferflocken',
          ...values,
          times: 14,
          grams: 80,
          portion_unit: null,
          portion_count: null,
        },
        {
          food_id: null,
          custom_food_id: 4,
          name: 'Protein pudding',
          ...values,
          times: 7,
          grams: 200,
          portion_unit: 'cup',
          portion_count: 1,
        },
      ],
      error: null,
    } as never);
    await act(() => i18n.changeLanguage('de'));
    const { result } = await renderHook(() => useFrequentFoods('breakfast'));
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(supabase.rpc).toHaveBeenCalledWith('frequent_foods', {
      for_meal: 'breakfast',
      language: 'de',
    });
    expect(result.current.data?.[0]).toMatchObject({
      ref: { kind: 'library', id: 'C133000' },
      name: 'Haferflocken',
      times: 14,
      amount: { grams: 80, portion: null },
    });
    expect(result.current.data?.[1]).toMatchObject({
      ref: { kind: 'custom', id: 4 },
      amount: { grams: 200, portion: { unit: 'cup', count: 1 } },
    });
  });
});

describe('useFavouriteFoods', () => {
  it('loads the favourites with their default portion', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        {
          food_id: 'C133000',
          custom_food_id: null,
          name: 'Oat flakes',
          ...values,
          portion_unit: 'serving',
          portion_grams: 50,
        },
      ],
      error: null,
    } as never);
    const { result } = await renderHook(() => useFavouriteFoods());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(supabase.rpc).toHaveBeenCalledWith('list_favourite_foods', { language: 'en' });
    expect(result.current.data?.[0]).toMatchObject({
      ref: { kind: 'library', id: 'C133000' },
      portion: { unit: 'serving', grams: 50 },
    });
  });
});

describe('useSetFavourite', () => {
  it('stars a food, also when it was starred already, and loads the favourites again', async () => {
    const insert = jest
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23505' } });
    jest.mocked(supabase.from).mockReturnValue({ insert } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useSetFavourite(), { queryClient });
    await act(() =>
      result.current.mutateAsync({ food: { kind: 'custom', id: 4 }, favourite: true }),
    );
    expect(insert).toHaveBeenCalledWith({ food_id: null, custom_food_id: 4 });
    await act(() =>
      result.current.mutateAsync({ food: { kind: 'library', id: 'C133000' }, favourite: true }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['favourite-foods'] });
  });

  it('takes the star away', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.from).mockReturnValue({ delete: () => ({ eq }) } as never);
    const { result } = await renderHook(() => useSetFavourite());
    await act(() =>
      result.current.mutateAsync({ food: { kind: 'library', id: 'C133000' }, favourite: false }),
    );
    expect(eq).toHaveBeenCalledWith('food_id', 'C133000');
  });

  it('fails on other errors', async () => {
    const insert = jest.fn().mockResolvedValue({ error: { code: 'BB027' } });
    jest.mocked(supabase.from).mockReturnValue({ insert } as never);
    const { result } = await renderHook(() => useSetFavourite());
    await expect(
      act(() =>
        result.current.mutateAsync({ food: { kind: 'library', id: 'C133000' }, favourite: true }),
      ),
    ).rejects.toEqual({ code: 'BB027' });
  });
});

describe('useMyFoods', () => {
  it("loads the user's foods that are not deleted, by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { id: 4, name: 'Protein pudding', ...values, portion_unit: 'cup', portion_grams: 200 },
      ],
      error: null,
    });
    const is = jest.fn(() => ({ order }));
    jest.mocked(supabase.from).mockReturnValue({ select: () => ({ is }) } as never);
    const { result } = await renderHook(() => useMyFoods());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(is).toHaveBeenCalledWith('archived_at', null);
    expect(order).toHaveBeenCalledWith('name');
    expect(result.current.data?.[0]?.ref).toEqual({ kind: 'custom', id: 4 });
  });
});
