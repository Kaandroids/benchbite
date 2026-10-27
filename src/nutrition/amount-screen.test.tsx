import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { AmountScreen } from './amount-screen';
import { useAddEntry, useFood, type Food } from './foods';
import { useDayEntries } from './meals';
import { useNutritionTargets } from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('./foods', () => ({
  ...jest.requireActual('./foods'),
  useFood: jest.fn(),
  useAddEntry: jest.fn(),
}));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./targets', () => ({ useNutritionTargets: jest.fn() }));

const YOGHURT: Food = {
  id: 'M141300',
  name: 'Yoghurt, 3.5% fat',
  per100g: { calories: 66, proteinG: 3.3, carbsG: 4.4, fatG: 3.6 },
  portions: [
    { unit: 'cup', grams: 150 },
    { unit: 'tablespoon', grams: 15 },
  ],
};

const loaded = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, isFetching: false, refetch: jest.fn() }) as never;

const mutate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useFood).mockReturnValue(loaded(YOGHURT));
  jest
    .mocked(useDayEntries)
    .mockReturnValue(
      loaded([{ meal: 'breakfast', calories: 960, proteinG: 40, carbsG: 100, fatG: 30 }]),
    );
  jest
    .mocked(useNutritionTargets)
    .mockReturnValue(loaded({ calories: 2550, proteinG: 144, carbsG: 300, fatG: 85 }));
  jest
    .mocked(useAddEntry)
    .mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never);
});

describe('AmountScreen', () => {
  it('starts with one default portion and shows what it adds to the day', async () => {
    await render(<AmountScreen foodId="M141300" meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('Yoghurt, 3.5% fat')).toBeTruthy();
    expect(screen.getByText('66 kcal per 100 g')).toBeTruthy();
    // The chip, and the amount under the count.
    expect(screen.getAllByText('1 cup · 150 g')).toHaveLength(2);
    expect(screen.getByText('99 kcal')).toBeTruthy();
    expect(screen.getByText('The day would be 1,059 of 2,550 kcal.')).toBeTruthy();
  });

  it('steps the portions in halves and adds them to the chosen meal', async () => {
    await render(<AmountScreen foodId="M141300" meal="lunch" day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('More'));
    await fireEvent.press(screen.getByLabelText('More'));
    expect(screen.getByText(/2 cups/)).toBeTruthy();
    expect(screen.getByText('198 kcal')).toBeTruthy();

    await fireEvent.press(screen.getByText('Dinner'));
    await fireEvent.press(screen.getByText('Add to dinner'));
    expect(mutate).toHaveBeenCalledWith(
      {
        day: '2026-10-27',
        meal: 'dinner',
        foodId: 'M141300',
        grams: 300,
        portion: { unit: 'cup', count: 2 },
      },
      expect.anything(),
    );
    jest.mocked(mutate).mock.calls[0]![1].onSuccess();
    expect(router.dismissTo).toHaveBeenCalledWith('/nutrition');
  });

  it('takes grams typed in', async () => {
    await render(<AmountScreen foodId="M141300" meal="snack" day="2026-10-27" />);
    await fireEvent.press(screen.getByText('Grams'));
    await fireEvent.changeText(screen.getByLabelText('Grams'), '80');
    expect(screen.getByText('53 kcal')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add a snack'));
    expect(mutate).toHaveBeenCalledWith(
      { day: '2026-10-27', meal: 'snack', foodId: 'M141300', grams: 80, portion: undefined },
      expect.anything(),
    );
  });

  it('keeps the amount within its limits', async () => {
    await render(<AmountScreen foodId="M141300" meal="lunch" day="2026-10-27" />);
    await fireEvent.press(screen.getByLabelText('Less'));
    expect(screen.getByLabelText('Less')).toBeDisabled();
    expect(screen.getByText(/0.5 cups/)).toBeTruthy();
  });

  it('stops at the most grams an entry holds', async () => {
    jest
      .mocked(useFood)
      .mockReturnValue(loaded({ ...YOGHURT, portions: [{ unit: 'bottle', grams: 750 }] }));
    await render(<AmountScreen foodId="M141300" meal="lunch" day="2026-10-27" />);
    for (let step = 0; step < 15; step++) {
      await fireEvent.press(screen.getByLabelText('More'));
    }
    expect(screen.getByText(/6.5 bottles · 4,875 g/)).toBeTruthy();
    expect(screen.getByLabelText('More')).toBeDisabled();
  });

  it('says when the food is no longer in the library', async () => {
    jest.mocked(useFood).mockReturnValue(loaded(null));
    await render(<AmountScreen foodId="X" meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('Food not found')).toBeTruthy();
  });
});
