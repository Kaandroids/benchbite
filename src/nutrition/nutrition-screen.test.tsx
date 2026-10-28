import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useWaterGoal } from '@/profile/water-goal';
import { fireEvent, render, screen } from '@/test/render';

import { useDayEntries, type MealEntry } from './meals';
import { NutritionScreen } from './nutrition-screen';
import { useDayTargets, type NutritionTargets } from './targets';
import { useWater } from './water';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./targets', () => ({ useDayTargets: jest.fn() }));
jest.mock('./meals', () => ({ ...jest.requireActual('./meals'), useDayEntries: jest.fn() }));
jest.mock('./water', () => ({ ...jest.requireActual('./water'), useWater: jest.fn() }));
jest.mock('@/profile/water-goal', () => ({ useWaterGoal: jest.fn() }));

const TARGETS: NutritionTargets = { calories: 2550, proteinG: 144, carbsG: 300, fatG: 85 };

const query = <T,>(data: T | undefined, state: Partial<{ isPending: boolean; isError: boolean }>) =>
  ({
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
    ...state,
  }) as never;

const entry = (meal: MealEntry['meal'], calories: number, proteinG = 20): MealEntry => ({
  meal,
  calories,
  proteinG,
  carbsG: 40,
  fatG: 10,
});

function mockDay(entries: MealEntry[] | undefined, state = {}) {
  jest.mocked(useDayEntries).mockReturnValue(query(entries, state));
}

beforeEach(() => {
  // A Tuesday at noon.
  jest.useFakeTimers({ now: new Date(2026, 9, 27, 12, 0), doNotFake: ['nextTick'] });
  jest.mocked(useDayTargets).mockReturnValue(query(TARGETS, {}));
  mockDay([]);
  jest.mocked(useWater).mockReturnValue(query(750, {}));
  jest.mocked(useWaterGoal).mockReturnValue(query(2000, {}));
});
afterEach(() => jest.useRealTimers());

/** The background of a button, to tell the filled + from the soft ones. */
const background = (label: string) =>
  StyleSheet.flatten(screen.getByLabelText(label).props.style).backgroundColor;

const progress = () =>
  screen.container
    .queryAll((node) => node.props.accessibilityRole === 'progressbar')
    .map((node) => [node.props.accessibilityLabel, node.props.accessibilityValue.now]);

describe('NutritionScreen', () => {
  it("shows today's calories left, the macros and every meal", async () => {
    mockDay([entry('breakfast', 520, 24), entry('breakfast', 0, 0), entry('lunch', 960, 72)]);
    await render(<NutritionScreen />);

    expect(jest.mocked(useDayEntries)).toHaveBeenLastCalledWith('2026-10-27');
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Tuesday, October 27')).toBeTruthy();
    expect(screen.getByText('1,070')).toBeTruthy();
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.getByText('96 / 144 g')).toBeTruthy();
    // The calories eaten of the goal sit on the goals button, not in the summary.
    expect(
      screen.getByRole('button', { name: '1,480 of 2,550 kcal eaten. Daily goals' }),
    ).toBeTruthy();
    expect(screen.getByText('/ 2,550 kcal')).toBeTruthy();
    expect(progress()[0]).toEqual(['1,480 of 2,550 kcal eaten', 58]);

    expect(screen.getByText(/2 items/)).toBeTruthy();
    expect(screen.getByLabelText('520 kcal, 24 g protein, 80 g carbs, 20 g fat')).toBeTruthy();
    expect(screen.getByText('Suggested 800 kcal')).toBeTruthy();
    expect(screen.getByText('Suggested 270 kcal')).toBeTruthy();
  });

  it('shows how far the calories are over', async () => {
    mockDay([entry('dinner', 2700)]);
    await render(<NutritionScreen />);
    expect(screen.getByText('150')).toBeTruthy();
    expect(screen.getByText('kcal over')).toBeTruthy();
    expect(screen.getAllByText('Nothing logged')).toHaveLength(3);
  });

  it('steps back through the last week and forward to today', async () => {
    await render(<NutritionScreen />);
    const next = screen.getByLabelText('Next day');
    expect(next).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Previous day'));
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(jest.mocked(useDayEntries)).toHaveBeenLastCalledWith('2026-10-26');

    for (let step = 0; step < 6; step++) {
      await fireEvent.press(screen.getByLabelText('Previous day'));
    }
    expect(jest.mocked(useDayEntries)).toHaveBeenLastCalledWith('2026-10-20');
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByLabelText('Previous day')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Next day'));
    expect(jest.mocked(useDayEntries)).toHaveBeenLastCalledWith('2026-10-21');
  });

  it('moves on to the new day after midnight', async () => {
    jest.setSystemTime(new Date(2026, 9, 27, 23, 30));
    await render(<NutritionScreen />);
    jest.setSystemTime(new Date(2026, 9, 28, 8, 0));
    await screen.rerender(<NutritionScreen />);
    expect(jest.mocked(useDayEntries)).toHaveBeenLastCalledWith('2026-10-28');
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('opens the search for a meal of the day shown', async () => {
    await render(<NutritionScreen />);
    await fireEvent.press(screen.getByLabelText('Previous day'));
    await fireEvent.press(screen.getByLabelText('Add to dinner'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/add',
      params: { meal: 'dinner', day: '2026-10-26' },
    });
  });

  it('opens a meal with its entries', async () => {
    await render(<NutritionScreen />);
    await fireEvent.press(screen.getByText('Lunch'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/nutrition/meal',
      params: { meal: 'lunch', day: '2026-10-27' },
    });
  });

  it('shows the meals without a summary before the targets exist', async () => {
    jest.mocked(useDayTargets).mockReturnValue(query(null, {}));
    await render(<NutritionScreen />);
    expect(screen.queryByText('kcal left')).toBeNull();
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getAllByText('Nothing logged')).toHaveLength(4);
  });

  it('offers to try again when the day fails to load', async () => {
    mockDay(undefined, { isError: true });
    await render(<NutritionScreen />);
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it("shows the day's water, and waits for it with the rest", async () => {
    await render(<NutritionScreen />);
    expect(jest.mocked(useWater)).toHaveBeenLastCalledWith('2026-10-27');
    expect(screen.getByText('0.75 of 2 L')).toBeTruthy();

    jest.mocked(useWater).mockReturnValue(query(undefined, { isPending: true }));
    await render(<NutritionScreen />);
    expect(screen.queryByText('Breakfast')).toBeNull();
  });

  it('keeps the day and its arrows while another day loads', async () => {
    await render(<NutritionScreen />);
    mockDay(undefined, { isPending: true });
    await fireEvent.press(screen.getByLabelText('Previous day'));
    expect(screen.getByText('Yesterday')).toBeTruthy();
    // The card stays, with the day's full date, while what it holds loads.
    expect(screen.getByText('Monday, October 26')).toBeTruthy();
    expect(screen.getByLabelText('Previous day')).toBeEnabled();
    expect(screen.queryByText('kcal left')).toBeNull();
  });

  it('shows the totals once the targets and the day are in, while the water still loads', async () => {
    jest.mocked(useWater).mockReturnValue(query(undefined, { isPending: true }));
    await render(<NutritionScreen />);
    expect(screen.getByText('kcal left')).toBeTruthy();
    expect(screen.queryByText('Breakfast')).toBeNull();
  });

  it("does not repeat a weekday that is already the day's name", async () => {
    await render(<NutritionScreen />);
    for (let back = 0; back < 2; back += 1) {
      await fireEvent.press(screen.getByLabelText('Previous day'));
    }
    expect(screen.getByText('Sunday')).toBeTruthy();
    expect(screen.getByText('October 25')).toBeTruthy();
  });

  it('gives each meal its own colour, its + included', async () => {
    await render(<NutritionScreen />);
    const labels = ['Add to breakfast', 'Add to lunch', 'Add to dinner', 'Add a snack'];
    const colours = labels.map(background);
    expect(new Set(colours).size).toBe(4);
  });

  it('opens the daily goals', async () => {
    await render(<NutritionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Daily goals/ }));
    expect(router.push).toHaveBeenCalledWith('/nutrition/goals');
  });
});
