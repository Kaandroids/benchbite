import { router } from 'expo-router';
import * as ReactNative from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { AmountScreen } from './amount-screen';
import { useAddEntry } from './entries';
import { useFood, type Food } from './foods';
import { useDayEntries } from './meals';
import { useFavouriteKeys, useSetFavourite } from './quick-foods';
import { useRecipe } from './recipes';
import { useNutritionTargets } from './targets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() },
}));
jest.mock('./foods', () => ({ ...jest.requireActual('./foods'), useFood: jest.fn() }));
jest.mock('./entries', () => ({ ...jest.requireActual('./entries'), useAddEntry: jest.fn() }));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./targets', () => ({ useNutritionTargets: jest.fn() }));
jest.mock('./quick-foods', () => ({ useFavouriteKeys: jest.fn(), useSetFavourite: jest.fn() }));
jest.mock('./recipes', () => ({ useRecipe: jest.fn() }));

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
const setFavourite = jest.fn();

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
  jest.mocked(useFavouriteKeys).mockReturnValue(new Set());
  jest.mocked(useSetFavourite).mockReturnValue({ mutate: setFavourite, isPending: false } as never);
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

  it('keeps typed grams as tall as the portion count, also with a large system font', async () => {
    const dimensions = jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 2,
    });
    await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="snack" day="2026-10-27" />,
    );
    await fireEvent.press(screen.getByText('Grams'));
    const input = screen.getByLabelText('Grams');
    expect(input.props.maxFontSizeMultiplier).toBe(1.3);
    expect(ReactNative.StyleSheet.flatten(input.props.style)).toMatchObject({ height: 44 * 1.3 });
    expect(screen.getByText('grams')).toBeTruthy();
    dimensions.mockRestore();
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

  it('starts over when the food changes its portions while it shows', async () => {
    const view = await render(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    await fireEvent.press(screen.getByLabelText('More'));
    expect(screen.getByText(/1.5 cups/)).toBeTruthy();

    jest.mocked(useFood).mockReturnValue(loaded({ ...YOGHURT, portions: [] }));
    await view.rerender(
      <AmountScreen food={{ kind: 'library', id: 'M141300' }} meal="lunch" day="2026-10-27" />,
    );
    expect(screen.getByLabelText('Grams').props.value).toBe('100');
  });

  it('says when the food is no longer in the library', async () => {
    jest.mocked(useFood).mockReturnValue(loaded(null));
    await render(
      <AmountScreen food={{ kind: 'library', id: 'X' }} meal="lunch" day="2026-10-27" />,
    );
    expect(screen.getByText('Food not found')).toBeTruthy();
  });

  it('stars the food, and takes the star away', async () => {
    await render(<AmountScreen food={YOGHURT.ref} meal="lunch" day="2026-10-27" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add to favourites' }));
    expect(setFavourite).toHaveBeenCalledWith(
      { food: YOGHURT.ref, favourite: true },
      expect.anything(),
    );

    jest.mocked(useFavouriteKeys).mockReturnValue(new Set(['M141300']));
    await render(<AmountScreen food={YOGHURT.ref} meal="lunch" day="2026-10-27" />);
    expect(screen.getByRole('button', { name: 'Remove from favourites' })).toBeSelected();
  });

  it('logs a recipe by the serving, shows what is in it and opens it to edit', async () => {
    jest.mocked(useFood).mockReturnValue(
      loaded({
        ref: { kind: 'recipe', id: 9 },
        name: 'Lentil soup',
        per100g: { calories: 68, proteinG: 4, carbsG: 9, fatG: 1.5 },
        portions: [{ unit: 'bowl', grams: 400 }],
      }),
    );
    jest.mocked(useRecipe).mockReturnValue(
      loaded({
        id: 9,
        name: 'Lentil soup',
        servings: 4,
        servingUnit: 'bowl',
        ingredients: [
          {
            food: { kind: 'library', id: 'H801000' },
            name: 'Red lentils',
            per100g: { calories: 337, proteinG: 24, carbsG: 50, fatG: 1.5 },
            grams: 250,
            portion: null,
          },
          {
            food: { kind: 'custom', id: 4 },
            name: 'Water',
            per100g: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
            grams: 1350,
            portion: null,
          },
        ],
      }),
    );
    await render(<AmountScreen food={{ kind: 'recipe', id: 9 }} meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('Recipe · 68 kcal per 100 g')).toBeTruthy();
    expect(screen.getAllByText('1 bowl · 400 g').length).toBeGreaterThan(0);
    expect(screen.getByText('In it · makes 4 bowls')).toBeTruthy();
    expect(screen.getByText('Red lentils 250 g · Water 1,350 g')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/edit-recipe/[id]',
      params: { id: '9', meal: 'lunch', day: '2026-10-27' },
    });
  });
});
