import { supabase } from '@/lib/supabase';
import i18n from '@/i18n';
import { act, renderHook, waitFor } from '@/test/render';

import {
  dueMeal,
  mealsOf,
  scaled,
  suggestedCalories,
  totalOf,
  useDayEntries,
  usePastMeal,
  type MealEntry,
} from './meals';

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

describe('scaled', () => {
  it('multiplies every value', () => {
    expect(scaled({ calories: 400, proteinG: 20, carbsG: 40, fatG: 8 }, 0.25)).toEqual({
      calories: 100,
      proteinG: 5,
      carbsG: 10,
      fatG: 2,
    });
  });
});

describe('dueMeal', () => {
  it('gives the meal of the time of day', () => {
    const at = (hour: number) => dueMeal(new Date(2026, 9, 28, hour, 30));
    expect([7, 10, 11, 15, 16, 20, 21, 23, 2].map(at)).toEqual([
      'breakfast',
      'breakfast',
      'lunch',
      'lunch',
      'dinner',
      'dinner',
      'snack',
      'snack',
      'breakfast',
    ]);
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
  const eq = jest.fn(() => ({ order: () => ({ order }) }));
  const select = jest.fn(() => ({ eq }));

  beforeEach(() => {
    jest.mocked(supabase.from).mockReturnValue({ select } as never);
  });

  const row = {
    id: 3,
    day: '2026-10-27',
    meal: 'breakfast',
    food_id: 'C133000',
    custom_food_id: null,
    recipe_id: null,
    grams: 50,
    portion_unit: 'serving',
    portion_count: 1,
    kcal_per_100g: 348,
    protein_per_100g: 13.22,
    carbs_per_100g: 53.3,
    fat_per_100g: 6.65,
    kcal: 174,
    protein_g: 6.6,
    carbs_g: 26.7,
    fat_g: 3.3,
    custom_foods: null,
    foods: {
      food_names: [
        { language: 'en', name: 'Oat flakes' },
        { language: 'de', name: 'Haferflocken' },
      ],
    },
  };

  afterEach(() => act(() => i18n.changeLanguage('en')));

  it("loads the day's entries with their food, amount, values and what each adds", async () => {
    order.mockResolvedValue({ data: [row], error: null });
    await act(() => i18n.changeLanguage('de'));
    const { result } = await renderHook(() => useDayEntries('2026-10-27'));
    await waitFor(() =>
      expect(result.current.data).toEqual([
        {
          id: 3,
          day: '2026-10-27',
          meal: 'breakfast',
          food: { kind: 'library', id: 'C133000' },
          name: 'Haferflocken',
          grams: 50,
          portion: { unit: 'serving', count: 1 },
          per100g: { calories: 348, proteinG: 13.22, carbsG: 53.3, fatG: 6.65 },
          calories: 174,
          proteinG: 6.6,
          carbsG: 26.7,
          fatG: 3.3,
        },
      ]),
    );
    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(eq).toHaveBeenCalledWith('day', '2026-10-27');
  });

  it("names an entry of the user's own food by that food", async () => {
    order.mockResolvedValue({
      data: [
        {
          ...row,
          food_id: null,
          custom_food_id: 12,
          recipe_id: null,
          foods: null,
          custom_foods: { name: 'Protein yoghurt' },
        },
      ],
      error: null,
    });
    const { result } = await renderHook(() => useDayEntries('2026-10-27'));
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Protein yoghurt'));
    expect(result.current.data?.[0]?.food).toEqual({ kind: 'custom', id: 12 });
  });

  it('falls back to the English name and leaves out a portion for grams', async () => {
    order.mockResolvedValue({
      data: [{ ...row, portion_unit: null, portion_count: null }],
      error: null,
    });
    await act(() => i18n.changeLanguage('tr'));
    const { result } = await renderHook(() => useDayEntries('2026-10-27'));
    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Oat flakes'));
    expect(result.current.data?.[0]?.portion).toBeNull();
  });

  it('fails with the error of the request', async () => {
    order.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = await renderHook(() => useDayEntries('2026-10-27'));
    await waitFor(() => expect(result.current.error).toEqual({ message: 'offline' }));
  });
});

describe('usePastMeal', () => {
  const entryRow = (id: number, day: string, name: string) => ({
    id,
    day,
    meal: 'lunch',
    food_id: `F${id}`,
    custom_food_id: null,
    recipe_id: null,
    grams: 100,
    portion_unit: null,
    portion_count: null,
    kcal_per_100g: 100,
    protein_per_100g: 0,
    carbs_per_100g: 0,
    fat_per_100g: 0,
    kcal: 100,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    custom_foods: null,
    foods: { archived_at: null, food_names: [{ language: 'en', name }] },
  });

  function mockRows(rows: unknown[]) {
    const query: Record<string, jest.Mock> = {};
    for (const method of ['eq', 'lt', 'gte', 'order']) {
      query[method] = jest.fn(() => query);
    }
    query.then = jest.fn((resolve: (value: unknown) => void) =>
      resolve({ data: rows, error: null }),
    );
    jest.mocked(supabase.from).mockReturnValue({ select: () => query } as never);
    return query;
  }

  it('gives the meal of the latest day before, up to a week back', async () => {
    const query = mockRows([
      entryRow(1, '2026-10-26', 'Bulgur'),
      entryRow(2, '2026-10-26', 'Ayran'),
      entryRow(3, '2026-10-24', 'Soup'),
    ]);
    const { result } = await renderHook(() => usePastMeal('2026-10-27', 'lunch'));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(query.eq).toHaveBeenCalledWith('meal', 'lunch');
    expect(query.lt).toHaveBeenCalledWith('day', '2026-10-27');
    expect(query.gte).toHaveBeenCalledWith('day', '2026-10-20');
    expect(result.current.data?.day).toBe('2026-10-26');
    expect(result.current.data?.entries.map((entry) => entry.name)).toEqual(['Bulgur', 'Ayran']);
  });

  it('leaves out foods that can no longer be logged, and days left with none', async () => {
    mockRows([
      {
        ...entryRow(1, '2026-10-26', 'Old bread'),
        foods: { archived_at: '2026-10-27', food_names: [] },
      },
      {
        ...entryRow(2, '2026-10-25', 'Bulgur'),
        foods: { archived_at: null, food_names: [{ language: 'en', name: 'Bulgur' }] },
      },
      {
        ...entryRow(3, '2026-10-25', 'My pudding'),
        food_id: null,
        custom_food_id: 9,
        recipe_id: null,
        foods: null,
        custom_foods: { name: 'My pudding', archived_at: '2026-10-26' },
      },
    ]);
    const { result } = await renderHook(() => usePastMeal('2026-10-27', 'lunch'));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.day).toBe('2026-10-25');
    expect(result.current.data?.entries.map((entry) => entry.name)).toEqual(['Bulgur']);
  });

  it('gives nothing when the meal was not eaten that week', async () => {
    mockRows([]);
    const { result } = await renderHook(() => usePastMeal('2026-10-27', 'lunch'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
