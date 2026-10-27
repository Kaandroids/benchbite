import { supabase } from '@/lib/supabase';
import { renderHook, waitFor } from '@/test/render';

import { mealsOf, suggestedCalories, totalOf, useDayEntries, type MealEntry } from './meals';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

const entry = (meal: MealEntry['meal'], calories: number): MealEntry => ({
  meal,
  calories,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
});

describe('totalOf', () => {
  it('adds up the entries', () => {
    expect(totalOf([entry('lunch', 300), entry('lunch', 200.5)])).toEqual({
      calories: 500.5,
      proteinG: 20,
      carbsG: 40,
      fatG: 10,
    });
  });
});

describe('mealsOf', () => {
  it('sums each meal and keeps empty ones, in the order of the day', () => {
    const meals = mealsOf([entry('lunch', 300), entry('breakfast', 200), entry('lunch', 100)]);
    expect(meals.map(({ meal, items, totals }) => [meal, items, totals.calories])).toEqual([
      ['breakfast', 1, 200],
      ['lunch', 2, 400],
      ['dinner', 0, 0],
      ['snack', 0, 0],
    ]);
  });
});

describe('suggestedCalories', () => {
  it('splits what is left between the empty meals by their shares', () => {
    const meals = mealsOf([entry('breakfast', 520), entry('lunch', 960)]);
    // 1,070 left: dinner 30 and snack 10 of 40 parts.
    expect(suggestedCalories(2550, meals)).toEqual(
      new Map([
        ['dinner', 800],
        ['snack', 270],
      ]),
    );
  });

  it('suggests the whole day for a day without entries', () => {
    expect(suggestedCalories(2000, mealsOf([])).get('breakfast')).toBe(500);
  });

  it('suggests nothing for a meal whose share rounds to 0', () => {
    const meals = mealsOf([entry('breakfast', 900), entry('lunch', 900), entry('dinner', 746)]);
    expect(suggestedCalories(2550, meals).size).toBe(0);
  });

  it('suggests nothing once the calories are used up', () => {
    expect(suggestedCalories(500, mealsOf([entry('breakfast', 600)])).size).toBe(0);
  });
});

describe('useDayEntries', () => {
  const order = jest.fn();
  const eq = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ eq }));

  beforeEach(() => {
    jest.mocked(supabase.from).mockReturnValue({ select } as never);
  });

  it("loads the day's entries with what each adds", async () => {
    order.mockResolvedValue({
      data: [{ meal: 'breakfast', kcal: 174, protein_g: 6.6, carbs_g: 26.7, fat_g: 3.3 }],
      error: null,
    });
    const { result } = await renderHook(() => useDayEntries('2026-10-27'));
    await waitFor(() =>
      expect(result.current.data).toEqual([
        { meal: 'breakfast', calories: 174, proteinG: 6.6, carbsG: 26.7, fatG: 3.3 },
      ]),
    );
    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(eq).toHaveBeenCalledWith('day', '2026-10-27');
  });

  it('fails with the error of the request', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = await renderHook(() => useDayEntries('2026-10-27'));
    await waitFor(() => expect(result.current.error).toEqual({ message: 'offline' }));
  });
});
