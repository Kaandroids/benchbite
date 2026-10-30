import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import {
  useAddEntry,
  useRemoveEntry,
  useCopyEntries,
  useLogEstimate,
  useRestoreEntry,
  useUndoEstimate,
  useUpdateEntry,
} from './entries';
import type { LoggedEntry } from './meals';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const MILK: LoggedEntry = {
  id: 7,
  day: '2026-10-27',
  meal: 'breakfast',
  food: { kind: 'library', id: 'M111300' },
  name: 'Whole milk',
  grams: 200,
  portion: { unit: 'glass', count: 1 },
  per100g: { calories: 64, proteinG: 3.3, carbsG: 4.8, fatG: 3.5 },
  calories: 128,
  proteinG: 6.6,
  carbsG: 9.6,
  fatG: 7,
};

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
        food: { kind: 'library', id: 'C133000' },
        grams: 100,
        portion: { unit: 'serving', count: 2 },
      }),
    );
    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(insert).toHaveBeenCalledWith({
      day: '2026-10-27',
      meal: 'breakfast',
      food_id: 'C133000',
      custom_food_id: null,
      recipe_id: null,
      grams: 100,
      portion_unit: 'serving',
      portion_count: 2,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-27'] });
    // A past week sums the day up.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', 'days'] });
  });

  it("logs a food of the user's own by its id", async () => {
    insert.mockResolvedValue({ error: null });
    const { result } = await renderHook(() => useAddEntry());
    await act(() =>
      result.current.mutateAsync({
        day: '2026-10-27',
        meal: 'snack',
        food: { kind: 'custom', id: 12 },
        grams: 200,
        portion: null,
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ food_id: null, custom_food_id: 12 }),
    );
  });

  it('logs grams without a portion', async () => {
    insert.mockResolvedValue({ error: null });
    const { result } = await renderHook(() => useAddEntry());
    await act(() =>
      result.current.mutateAsync({
        day: '2026-10-27',
        meal: 'snack',
        food: { kind: 'library', id: 'C133000' },
        grams: 35,
        portion: null,
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
        result.current.mutateAsync({
          day: '2026-10-01',
          meal: 'snack',
          food: { kind: 'library', id: 'X' },
          grams: 1,
          portion: null,
        }),
      ),
    ).rejects.toEqual({ code: 'BB020' });
  });
});

describe('useUpdateEntry', () => {
  it("changes the amount and loads the day's entries again", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdateEntry(), { queryClient });
    await act(() =>
      result.current.mutateAsync({
        id: 7,
        day: '2026-10-27',
        amount: { grams: 75, portion: null },
      }),
    );
    expect(update).toHaveBeenCalledWith({ grams: 75, portion_unit: null, portion_count: null });
    expect(eq).toHaveBeenCalledWith('id', 7);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-27'] });
  });
});

describe('useRemoveEntry', () => {
  it("removes the entry and loads the day's entries again", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ delete: remove } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useRemoveEntry(), { queryClient });
    await act(() => result.current.mutateAsync(MILK));
    expect(eq).toHaveBeenCalledWith('id', 7);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-27'] });
  });
});

describe('useRestoreEntry', () => {
  it("puts the entry back and loads the day's entries again", async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useRestoreEntry(), { queryClient });
    await act(() => result.current.mutateAsync(MILK));
    expect(supabase.rpc).toHaveBeenCalledWith('restore_meal_entry', { entry_id: 7 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-27'] });
  });

  it('fails when the entry can no longer be restored', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ error: { code: 'BB023' } } as never);
    const { result } = await renderHook(() => useRestoreEntry());
    await expect(act(() => result.current.mutateAsync(MILK))).rejects.toEqual({ code: 'BB023' });
  });
});

describe('useCopyEntries', () => {
  it('adds copies of the entries picked in one step and loads the lists again', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: 2, error: null } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useCopyEntries(), { queryClient });
    let added;
    await act(async () => {
      added = await result.current.mutateAsync({ ids: [4, 5], day: '2026-10-27', meal: 'lunch' });
    });
    expect(added).toBe(2);
    expect(supabase.rpc).toHaveBeenCalledWith('copy_meal_entries', {
      entry_ids: [4, 5],
      to_day: '2026-10-27',
      to_meal: 'lunch',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-27'] });
  });
});

describe('changing entries', () => {
  it('loads the frequent foods and past meals again, which count every day', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.from).mockReturnValue({ delete: () => ({ eq }) } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useRemoveEntry(), { queryClient });
    await act(() => result.current.mutateAsync(MILK));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['frequent-foods'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['nutrition-targets', 'day', '2026-10-27'],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['past-meal'] });
  });
});

describe('useLogEstimate', () => {
  it('logs found foods by their id and the rest by their values, in one call', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { entry_id: 11, custom_food_id: null, created_food: false, kcal: 234 },
        { entry_id: 12, custom_food_id: 5, created_food: true, kcal: 46.6 },
        // The user's own Dal, at its own values.
        { entry_id: 13, custom_food_id: 3, created_food: false, kcal: 180 },
      ],
      error: null,
    } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useLogEstimate(), { queryClient });

    const logged = await act(() =>
      result.current.mutateAsync({
        day: '2026-10-30',
        meal: 'dinner',
        entries: [
          { food: { kind: 'library', id: 'C352032' }, grams: 200 },
          {
            name: 'Mango chutney',
            grams: 20,
            per100g: { calories: 233, proteinG: 0.5, carbsG: 57, fatG: 0.3 },
          },
          {
            name: 'Dal',
            grams: 150,
            per100g: { calories: 140, proteinG: 6, carbsG: 14, fatG: 7 },
          },
        ],
      }),
    );

    expect(supabase.rpc).toHaveBeenCalledWith('log_meal_estimate', {
      day: '2026-10-30',
      meal: 'dinner',
      items: [
        { food_id: 'C352032', custom_food_id: null, recipe_id: null, grams: 200 },
        { name: 'Mango chutney', grams: 20, kcal: 233, protein_g: 0.5, carbs_g: 57, fat_g: 0.3 },
        { name: 'Dal', grams: 150, kcal: 140, protein_g: 6, carbs_g: 14, fat_g: 7 },
      ],
    });
    expect(logged).toEqual({
      day: '2026-10-30',
      entryIds: [11, 12, 13],
      foods: [
        { kind: 'library', id: 'C352032' },
        { kind: 'custom', id: 5 },
        { kind: 'custom', id: 3 },
      ],
      createdFoodIds: [5],
      calories: 460.6,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['meal-entries', '2026-10-30'] });
    // A new food of one's own shows in the lists of one's foods.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['food-search'] });
  });
});

describe('useUndoEstimate', () => {
  it('takes the entries and the foods it made back in one call', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    const { result } = await renderHook(() => useUndoEstimate());

    await act(() =>
      result.current.mutateAsync({
        day: '2026-10-30',
        entryIds: [11, 12],
        foods: [],
        createdFoodIds: [5],
        calories: 280,
      }),
    );

    expect(supabase.rpc).toHaveBeenCalledWith('undo_meal_estimate', {
      entry_ids: [11, 12],
      food_ids: [5],
    });
  });
});
