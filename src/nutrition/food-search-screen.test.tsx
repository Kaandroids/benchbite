import { router } from 'expo-router';

import { fireEvent, render, screen } from '@/test/render';

import { FoodSearchScreen } from './food-search-screen';
import { useAddEntry, useFoodSearch, type FoodResult } from './foods';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('./foods', () => ({
  ...jest.requireActual('./foods'),
  useFoodSearch: jest.fn(),
  useAddEntry: jest.fn(),
}));

const OATS: FoodResult = {
  id: 'C133000',
  name: 'Oat flakes',
  per100g: { calories: 348, proteinG: 13.22, carbsG: 53.3, fatG: 6.65 },
  portion: { unit: 'serving', grams: 50 },
};

const mutate = jest.fn();

function mockSearch(state: Partial<{ data: FoodResult[]; isError: boolean; isFetching: boolean }>) {
  jest
    .mocked(useFoodSearch)
    .mockReturnValue({ isError: false, isFetching: false, ...state } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch({});
  jest.mocked(useAddEntry).mockReturnValue({ mutate, isError: false, error: null } as never);
});

describe('FoodSearchScreen', () => {
  it('asks for two letters before searching', async () => {
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('Add to lunch')).toBeTruthy();
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
    mockSearch({ data: [OATS] });
    await render(<FoodSearchScreen meal="breakfast" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'oat');
    await fireEvent.press(screen.getByLabelText('Add 1 serving of Oat flakes'));

    expect(mutate).toHaveBeenCalledWith(
      {
        day: '2026-10-27',
        meal: 'breakfast',
        foodId: 'C133000',
        grams: 50,
        portion: { unit: 'serving', count: 1 },
      },
      expect.anything(),
    );
  });

  it('says when nothing matches', async () => {
    mockSearch({ data: [] });
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'xyz');
    expect(screen.getByText('No food matches “xyz”.')).toBeTruthy();
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
      .mockReturnValue({ mutate, isError: true, error: { code: 'BB022' } } as never);
    await render(<FoodSearchScreen meal="lunch" day="2026-10-27" />);
    expect(screen.getByText('This food is no longer in the library.')).toBeTruthy();
  });

  it('says when a day can no longer be changed', async () => {
    jest
      .mocked(useAddEntry)
      .mockReturnValue({ mutate, isError: true, error: { code: 'BB020' } } as never);
    await render(<FoodSearchScreen meal="lunch" day="2026-10-01" />);
    expect(screen.getByText('Meals can only be added to today and the week before.')).toBeTruthy();
  });
});
