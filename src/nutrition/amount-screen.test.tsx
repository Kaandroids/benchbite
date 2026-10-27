import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { AmountScreen } from './amount-screen';
import { useAddEntry } from './entries';
import { useFood, type Food } from './foods';
import { useDayEntries } from './meals';
import { useNutritionTargets } from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() },
}));
jest.mock('./foods', () => ({ ...jest.requireActual('./foods'), useFood: jest.fn() }));
jest.mock('./entries', () => ({ ...jest.requireActual('./entries'), useAddEntry: jest.fn() }));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./targets', () => ({ useNutritionTargets: jest.fn() }));

const YOGHURT: Food = {
  ref: { kind: 'library', id: 'M141300' },
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
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    expect(screen.getByText('Yoghurt, 3.5% fat')).toBeTruthy();
    expect(screen.getByText('66 kcal per 100 g')).toBeTruthy();
    // The chip, and the amount under the count.
    expect(screen.getAllByText('1 cup · 150 g')).toHaveLength(2);
    expect(screen.getByText('99 kcal')).toBeTruthy();
    expect(screen.getByText('The day would be 1,059 of 2,550 kcal.')).toBeTruthy();
  });

  it('steps the portions in halves and adds them to the meal the search was opened for', async () => {
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    await fireEvent.press(screen.getByLabelText('More'));
    await fireEvent.press(screen.getByLabelText('More'));
    expect(screen.getByText(/2 cups/)).toBeTruthy();
    expect(screen.getByText('198 kcal')).toBeTruthy();

    // The meal is fixed where the search was opened.
    expect(screen.queryByText('Dinner')).toBeNull();
    await fireEvent.press(screen.getByText('Add to lunch'));
    expect(mutate).toHaveBeenCalledWith(
      {
        day: '2026-10-27',
        meal: 'lunch',
        food: { kind: 'library', id: 'M141300' },
        grams: 300,
        portion: { unit: 'cup', count: 2 },
      },
      expect.anything(),
    );
    jest.mocked(mutate).mock.calls[0]![1].onSuccess();
    expect(router.dismissTo).toHaveBeenCalledWith('/nutrition');
  });

  it('takes grams typed in', async () => {
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="snack" day="2026-10-27" />,
    );
    await fireEvent.press(screen.getByText('Grams'));
    await fireEvent.changeText(screen.getByLabelText('Grams'), '80');
    expect(screen.getByText('53 kcal')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add a snack'));
    expect(mutate).toHaveBeenCalledWith(
      {
        day: '2026-10-27',
        meal: 'snack',
        food: { kind: 'library', id: 'M141300' },
        grams: 80,
        portion: null,
      },
      expect.anything(),
    );
  });

  it('turns Add off while the grams typed are no amount', async () => {
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    await fireEvent.press(screen.getByText('Grams'));
    await fireEvent.changeText(screen.getByLabelText('Grams'), '');
    expect(screen.getByRole('button', { name: 'Add to lunch' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Grams'), '6000');
    expect(screen.getByRole('button', { name: 'Add to lunch' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Grams'), '250,5');
    expect(screen.getByRole('button', { name: 'Add to lunch' })).toBeEnabled();
  });

  it('keeps the amount within its limits', async () => {
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    await fireEvent.press(screen.getByLabelText('Less'));
    expect(screen.getByLabelText('Less')).toBeDisabled();
    expect(screen.getByText(/0.5 cups/)).toBeTruthy();
  });

  it('stops at the most grams an entry holds', async () => {
    jest
      .mocked(useFood)
      .mockReturnValue(loaded({ ...YOGHURT, portions: [{ unit: 'bottle', grams: 750 }] }));
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    for (let step = 0; step < 15; step++) {
      await fireEvent.press(screen.getByLabelText('More'));
    }
    expect(screen.getByText(/6.5 bottles · 4,875 g/)).toBeTruthy();
    expect(screen.getByLabelText('More')).toBeDisabled();
  });

  it("opens a food of one's own to change it, and only that", async () => {
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

    jest
      .mocked(useFood)
      .mockReturnValue(loaded({ ...YOGHURT, ref: { kind: 'custom', id: 12 }, name: 'My yoghurt' }));
    await render(<AmountScreen food={{ kind: 'custom', id: 12 }} meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('My yoghurt')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/edit-food/[id]',
      params: { id: '12', meal: 'lunch', day: '2026-10-27' },
    });
  });

  it('says when the food is no longer in the library', async () => {
    jest.mocked(useFood).mockReturnValue(loaded(null));
    await render(
      <AmountScreen food={{ kind: 'library', id: 'X' }} meal="lunch" day="2026-10-27" />,
    );
    expect(screen.getByText('Food not found')).toBeTruthy();
  });
});
