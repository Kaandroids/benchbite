import { router } from 'expo-router';

import { act, fireEvent, render, screen } from '@/test/render';

import { FoodSearchScreen } from './food-search-screen';
import { useAddEntry, useRepeatMeal } from './entries';
import { useFoodSearch, type FoodResult } from './foods';
import { usePastMeal, type LoggedEntry } from './meals';
import {
  useFavouriteFoods,
  useFavouriteKeys,
  useFrequentFoods,
  useMyFoods,
  type FrequentFood,
} from './quick-foods';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('./entries', () => ({
  ...jest.requireActual('./entries'),
  useAddEntry: jest.fn(),
  useRepeatMeal: jest.fn(),
}));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), usePastMeal: jest.fn() }));
jest.mock('./quick-foods', () => ({
  useFrequentFoods: jest.fn(),
  useFavouriteFoods: jest.fn(),
  useFavouriteKeys: jest.fn(),
  useMyFoods: jest.fn(),
}));
jest.mock('./foods', () => ({
  ...jest.requireActual('./foods'),
  useFoodSearch: jest.fn(),
  // Typing settles at once here; the delay has its own test.
  useSettledQuery: (query: string) => query,
}));

const EGG: FoodResult = {
  ref: { kind: 'library', id: 'E111100' },
  name: 'Egg, raw',
  per100g: { calories: 137, proteinG: 12.5, carbsG: 0.5, fatG: 9.3 },
  portion: { unit: 'piece', grams: 60 },
};

const OATS: FoodResult = {
  ref: { kind: 'library', id: 'C133000' },
  name: 'Oat flakes',
  per100g: { calories: 348, proteinG: 13.22, carbsG: 53.3, fatG: 6.65 },
  portion: { unit: 'serving', grams: 50 },
};

const mutateAsync = jest.fn();
const repeat = jest.fn();

const loaded = <T,>(data: T) => ({ data, isError: false }) as never;

function mockSearch(
  state: Partial<{
    data: FoodResult[];
    isError: boolean;
    isFetching: boolean;
    isPlaceholderData: boolean;
  }>,
) {
  jest.mocked(useFoodSearch).mockReturnValue({
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    ...state,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch({});
  jest.mocked(useAddEntry).mockReturnValue({ mutateAsync, isError: false, error: null } as never);
  jest.mocked(useRepeatMeal).mockReturnValue({ mutate: repeat, isError: false } as never);
  jest.mocked(usePastMeal).mockReturnValue(loaded(null));
  jest.mocked(useFrequentFoods).mockReturnValue(loaded([]));
  jest.mocked(useFavouriteFoods).mockReturnValue(loaded([]));
  jest.mocked(useFavouriteKeys).mockReturnValue(new Set());
  jest.mocked(useMyFoods).mockReturnValue(loaded([]));
});

describe('FoodSearchScreen', () => {
  it('asks for two letters before searching', async () => {
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('Add to lunch')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'o');
    expect(screen.getByText('Type at least two letters to search the food library.')).toBeTruthy();
  });

  it('shows each result with its portion and calories, and opens it', async () => {
    mockSearch({ data: [OATS] });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'oat');

    expect(screen.getByText('1 serving · 50 g · 174 kcal')).toBeTruthy();
    await fireEvent.press(screen.getByText('Oat flakes'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/food/[id]',
      params: { id: 'C133000', meal: 'lunch', day: '2026-10-27' },
    });
  });

  it('adds the default portion at once with +', async () => {
    mutateAsync.mockResolvedValue(undefined);
    mockSearch({ data: [OATS] });
    await render(<FoodSearchScreen meal="breakfast" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'oat');
    await fireEvent.press(screen.getByLabelText('Add 1 serving of Oat flakes'));

    expect(mutateAsync).toHaveBeenCalledWith({
      day: '2026-10-27',
      meal: 'breakfast',
      food: { kind: 'library', id: 'C133000' },
      grams: 50,
      portion: { unit: 'serving', count: 1 },
    });
    expect(screen.queryByLabelText('Add 1 serving of Oat flakes')).toBeNull();
  });

  it('marks every food added quickly in a row, and saves each once', async () => {
    const saves: (() => void)[] = [];
    mutateAsync.mockImplementation(() => new Promise<void>((resolve) => saves.push(resolve)));
    mockSearch({ data: [OATS, EGG] });
    await render(<FoodSearchScreen meal="breakfast" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'ea');

    await fireEvent.press(screen.getByLabelText('Add 1 serving of Oat flakes'));
    await fireEvent.press(screen.getByLabelText('Add 1 serving of Oat flakes'));
    await fireEvent.press(screen.getByLabelText('Add 1 piece of Egg, raw'));
    expect(mutateAsync).toHaveBeenCalledTimes(2);

    await act(async () => saves.forEach((save) => save()));
    expect(screen.queryByLabelText('Add 1 serving of Oat flakes')).toBeNull();
    expect(screen.queryByLabelText('Add 1 piece of Egg, raw')).toBeNull();
  });

  it("marks the user's own foods and adds 100 g of one without a portion", async () => {
    mutateAsync.mockResolvedValue(undefined);
    mockSearch({
      data: [
        {
          ref: { kind: 'custom', id: 12 },
          name: 'Protein yoghurt',
          per100g: { calories: 70, proteinG: 10, carbsG: 6.5, fatG: 0.3 },
          portion: null,
        },
      ],
    });
    await render(<FoodSearchScreen meal="snack" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'protein');
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('100 g · 70 kcal')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add 100 g of Protein yoghurt'));
    expect(mutateAsync).toHaveBeenCalledWith({
      day: '2026-10-27',
      meal: 'snack',
      food: { kind: 'custom', id: 12 },
      grams: 100,
      portion: null,
    });
    await fireEvent.press(screen.getByText('Protein yoghurt'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/food/[id]',
      params: { id: 'custom-12', meal: 'snack', day: '2026-10-27' },
    });
  });

  it('opens a new food with what was typed', async () => {
    mockSearch({ data: [] });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'protein yog');
    await fireEvent.press(screen.getByText('New food'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/new-food',
      params: { meal: 'lunch', day: '2026-10-27', name: 'protein yog' },
    });
  });

  it('says when nothing matches', async () => {
    mockSearch({ data: [] });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'xyz');
    expect(screen.getByText('No food matches “xyz”.')).toBeTruthy();
  });

  it('waits for the search of what is typed before saying nothing matches', async () => {
    mockSearch({ data: [], isPlaceholderData: true, isFetching: true });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'xyzw');
    expect(screen.queryByText(/No food matches/)).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says when a newer search fails, over the last results', async () => {
    mockSearch({ data: [OATS], isError: true, isPlaceholderData: true });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'oats');
    expect(
      screen.getByText('The search failed. Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Oat flakes')).toBeNull();
  });

  it('says when the search fails', async () => {
    mockSearch({ isError: true });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'oat');
    expect(
      screen.getByText('The search failed. Check your connection and try again.'),
    ).toBeTruthy();
  });

  it('says when a food was taken out of the library', async () => {
    jest
      .mocked(useAddEntry)
      .mockReturnValue({ mutateAsync, isError: true, error: { code: 'BB022' } } as never);
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('This food is no longer available.')).toBeTruthy();
  });

  it('says when a day can no longer be changed', async () => {
    jest
      .mocked(useAddEntry)
      .mockReturnValue({ mutateAsync, isError: true, error: { code: 'BB020' } } as never);
    await render(<FoodSearchScreen meal="lunch" day="2026-10-01" />);
    expect(screen.getByText('Meals can only be added to today and the week before.')).toBeTruthy();
  });

  describe('before anything is typed', () => {
    const frequent = (food: FoodResult, times: number, amount: FrequentFood['amount']) =>
      ({ ...food, times, amount }) as FrequentFood;

    it("offers the meal's frequent foods, and + adds one as it was logged last", async () => {
      mutateAsync.mockResolvedValue(undefined);
      jest
        .mocked(useFrequentFoods)
        .mockReturnValue(loaded([frequent(OATS, 14, { grams: 80, portion: null })]));
      await render(<FoodSearchScreen meal="breakfast" day="2026-10-27" />);
      expect(jest.mocked(useFrequentFoods)).toHaveBeenCalledWith('breakfast');
      expect(screen.getByText('Often at breakfast')).toBeTruthy();
      expect(screen.getByText('80 g · 278 kcal · 14×')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Add 80 g of Oat flakes'));
      expect(mutateAsync).toHaveBeenCalledWith({
        day: '2026-10-27',
        meal: 'breakfast',
        food: OATS.ref,
        grams: 80,
        portion: null,
      });
    });

    it('says how to start when nothing was logged at the meal yet', async () => {
      await render(<FoodSearchScreen meal="dinner" day="2026-10-27" />);
      expect(screen.getByText('Nothing logged at dinner yet')).toBeTruthy();
    });

    it('adds the meal as it was last eaten in one tap', async () => {
      const entry = (name: string, calories: number) =>
        ({ name, calories, proteinG: 0, carbsG: 0, fatG: 0 }) as LoggedEntry;
      jest
        .mocked(usePastMeal)
        .mockReturnValue(
          loaded({ day: '2026-10-26', entries: [entry('Bulgur', 208), entry('Ayran', 74)] }),
        );
      await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
      expect(screen.getByText('Your last lunch')).toBeTruthy();
      expect(screen.getByText('2 foods · 282 kcal')).toBeTruthy();
      expect(screen.getByText('Yesterday · Bulgur, Ayran')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Add all 2 foods of Yesterday'));
      expect(repeat).toHaveBeenCalledWith({ from: '2026-10-26', to: '2026-10-27', meal: 'lunch' });
    });

    it('shows the favourites and the own foods on their tabs', async () => {
      jest.mocked(useFavouriteFoods).mockReturnValue(loaded([EGG]));
      jest.mocked(useFavouriteKeys).mockReturnValue(new Set(['E111100']));
      await render(<FoodSearchScreen meal="breakfast" day="2026-10-27" />);

      await fireEvent.press(screen.getByRole('button', { name: 'Favourites' }));
      expect(screen.getByLabelText('Egg, raw, Favourite, 1 piece · 60 g · 82 kcal')).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'Mine' }));
      expect(screen.getByText('No foods of your own yet')).toBeTruthy();
    });

    it('says when a list cannot be loaded', async () => {
      jest.mocked(useFrequentFoods).mockReturnValue({ data: undefined, isError: true } as never);
      await render(<FoodSearchScreen meal="breakfast" day="2026-10-27" />);
      expect(
        screen.getByText('The list could not be loaded. Check your connection and try again.'),
      ).toBeTruthy();
    });
  });

  it('marks favourites among the results', async () => {
    mockSearch({ data: [OATS, EGG] });
    jest.mocked(useFavouriteKeys).mockReturnValue(new Set(['C133000']));
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'ea');
    expect(
      screen.getByLabelText('Oat flakes, Favourite, 1 serving · 50 g · 174 kcal'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Egg, raw, 1 piece · 60 g · 82 kcal')).toBeTruthy();
  });
});
