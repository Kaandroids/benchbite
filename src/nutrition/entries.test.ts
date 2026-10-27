import { supabase } from '@/lib/supabase';
import { act, createTestQueryClient, renderHook } from '@/test/render';

import {
  restoreOf,
  setRemovedEntry,
  takeRemovedEntry,
  useAddEntry,
  useRemoveEntry,
  useUpdateEntry,
} from './entries';
import type { LoggedEntry } from './meals';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const MILK: LoggedEntry = {
  id: 7,
  day: '2026-10-27',
  meal: 'breakfast',
  foodId: 'M111300',
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

describe('useUpdateEntry', () => {
  it("changes the amount and loads the day's entries again", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    jest.mocked(supabase.from).mockReturnValue({ update } as never);
    const queryClient = createTestQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdateEntry(), { queryClient });
    await act(() =>
      result.current.mutateAsync({ id: 7, day: '2026-10-27', amount: { grams: 75 } }),
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

describe('restoreOf', () => {
  it('logs the same food and amount to the same meal and day', () => {
    expect(restoreOf(MILK)).toEqual({
      day: '2026-10-27',
      meal: 'breakfast',
      foodId: 'M111300',
      grams: 200,
      portion: { unit: 'glass', count: 1 },
    });
  });
});

describe('takeRemovedEntry', () => {
  it('hands the removed entry over once', () => {
    setRemovedEntry(MILK);
    expect(takeRemovedEntry()).toBe(MILK);
    expect(takeRemovedEntry()).toBeNull();
  });
});
