import { router } from 'expo-router';

import { act, fireEvent, render, screen } from '@/test/render';

import { useRemoveEntry, useRestoreEntry } from './entries';
import { MealScreen } from './meal-screen';
import { useDayEntries, type LoggedEntry } from './meals';
import { handOverRemovedEntry } from './removed-entry';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    // Runs once on mount, as the screen comes into focus.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./entries', () => ({
  ...jest.requireActual('./entries'),
  useRemoveEntry: jest.fn(),
  useRestoreEntry: jest.fn(),
}));

const entry = (id: number, name: string, meal: LoggedEntry['meal'], calories: number) =>
  ({
    id,
    day: '2026-10-27',
    meal,
    foodId: `F${id}`,
    name,
    grams: 200,
    portion: { unit: 'glass', count: 1 },
    per100g: { calories: calories / 2, proteinG: 1, carbsG: 1, fatG: 1 },
    calories,
    proteinG: 2,
    carbsG: 2,
    fatG: 2,
  }) satisfies LoggedEntry;

const OATS = entry(1, 'Oat flakes', 'breakfast', 174);
const MILK = entry(2, 'Whole milk', 'breakfast', 128);
const SOUP = entry(3, 'Lentil soup', 'lunch', 310);

const mutateAsync = jest.fn();
const mutate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 9, 27, 12, 0), doNotFake: ['nextTick'] });
  jest.mocked(useDayEntries).mockReturnValue({
    data: [OATS, MILK, SOUP],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  } as never);
  jest
    .mocked(useRemoveEntry)
    .mockReturnValue({ mutateAsync, isError: false, isPending: false } as never);
  jest.mocked(useRestoreEntry).mockReturnValue({ mutate, isError: false } as never);
});
afterEach(() => jest.useRealTimers());

describe('MealScreen', () => {
  it("shows the meal's entries of the day with their totals", async () => {
    await render(<MealScreen meal="breakfast" day="2026-10-27" />);
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getByText('Today · Tue, Oct 27')).toBeTruthy();
    expect(screen.getByText('302 kcal')).toBeTruthy();
    expect(screen.getByText('Oat flakes')).toBeTruthy();
    expect(screen.getAllByText('1 glass · 200 g')).toHaveLength(2);
    expect(screen.queryByText('Lentil soup')).toBeNull();
  });

  it('opens an entry, and adds to the meal', async () => {
    await render(<MealScreen meal="breakfast" day="2026-10-27" />);
    await fireEvent.press(screen.getByText('Whole milk'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/entry/[id]',
      params: { id: '2', day: '2026-10-27' },
    });
    await fireEvent.press(screen.getByText('Add to breakfast'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/add',
      params: { meal: 'breakfast', day: '2026-10-27' },
    });
  });

  it('removes an entry and offers to undo it', async () => {
    mutateAsync.mockResolvedValue(undefined);
    await render(<MealScreen meal="breakfast" day="2026-10-27" />);
    // The Remove button shows only once the row is swiped, so the row's action stands in for it.
    const row = screen.getByRole('button', { name: /^Whole milk/ });
    await act(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'remove' } }));
    expect(mutateAsync).toHaveBeenCalledWith(MILK);

    await fireEvent.press(await screen.findByRole('button', { name: 'Undo' }));
    expect(mutate).toHaveBeenCalledWith(MILK);
  });

  it('offers to undo an entry removed on its own screen, on its meal only', async () => {
    handOverRemovedEntry(OATS);
    await render(<MealScreen meal="lunch" day="2026-10-27" />);
    expect(screen.queryByText('Oat flakes removed')).toBeNull();
    await render(<MealScreen meal="breakfast" day="2026-10-27" />);
    expect(screen.getByText('Oat flakes removed')).toBeTruthy();
  });

  it('says when a meal has nothing yet', async () => {
    await render(<MealScreen meal="dinner" day="2026-10-27" />);
    expect(screen.getByText('Nothing logged yet.')).toBeTruthy();
    expect(screen.queryByText('Swipe an entry left to remove it.')).toBeNull();
  });
});
