import { useDayNutrition, type DayNutrition } from '@/nutrition/day-nutrition';
import { fireEvent, render, screen } from '@/test/render';

import { NutritionCard } from './nutrition-card';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/nutrition/day-nutrition', () => ({
  ...jest.requireActual('@/nutrition/day-nutrition'),
  useDayNutrition: jest.fn(),
}));

const TODAY = new Date(2026, 9, 29, 9, 0);
const TARGETS = { calories: 2000, proteinG: 150, carbsG: 200, fatG: 60 };

const day = (date: string, calories: number): DayNutrition => ({
  day: date,
  eaten: { calories, proteinG: 150, carbsG: 200, fatG: 60 },
  entries: calories > 0 ? 1 : 0,
  targets: TARGETS,
  keptTarget: calories > 0 && calories <= TARGETS.calories,
});

const refetch = jest.fn();

function mockDays(days: DayNutrition[] | null, isError = false, isPlaceholderData = false) {
  jest.mocked(useDayNutrition).mockReturnValue({
    data: days ?? undefined,
    isError,
    isPlaceholderData,
    refetch,
  } as never);
}

beforeEach(() => jest.clearAllMocks());

it('charts each day of the month and sums them up against their targets', async () => {
  mockDays([day('2026-10-27', 1800), day('2026-10-28', 0), day('2026-10-29', 2200)]);
  await render(<NutritionCard today={TODAY} />);
  expect(useDayNutrition).toHaveBeenCalledWith(TODAY, new Date(2026, 8, 29), TODAY, {
    keepLast: true,
  });
  expect(screen.getByLabelText('2,000 kcal on average')).toBeTruthy();
  expect(
    screen.getByLabelText('Oct 27: 1,800 kcal, 150 g protein, 200 g carbs, 60 g fat a day'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Oct 28: nothing logged')).toBeTruthy();
  expect(
    screen.getByLabelText(
      'Oct 29: 2,200 kcal, 150 g protein, 200 g carbs, 60 g fat a day, over the target',
    ),
  ).toBeTruthy();
  expect(screen.getByText('2 days logged, 1 within the target')).toBeTruthy();
  expect(screen.getByText('4,000 / 4,000 kcal')).toBeTruthy();
  expect(screen.getByText('300 / 300')).toBeTruthy();
});

it('averages longer ranges by week', async () => {
  mockDays([day('2026-10-18', 2400), day('2026-10-19', 1800), day('2026-10-21', 2200)]);
  await render(<NutritionCard today={TODAY} />);
  await fireEvent.press(screen.getByText('3M'));
  expect(useDayNutrition).toHaveBeenLastCalledWith(TODAY, new Date(2026, 6, 29), TODAY, {
    keepLast: true,
  });
  expect(
    screen.getByLabelText('Week of Oct 19: 2,000 kcal, 150 g protein, 200 g carbs, 60 g fat a day'),
  ).toBeTruthy();
});

it('keeps the bars of the last range while a new one loads', async () => {
  mockDays([day('2026-10-27', 1800), day('2026-10-28', 2200)]);
  await render(<NutritionCard today={TODAY} />);
  mockDays([day('2026-10-27', 1800), day('2026-10-28', 2200)], false, true);
  await fireEvent.press(screen.getByText('3M'));
  expect(
    screen.getByLabelText('Oct 27: 1,800 kcal, 150 g protein, 200 g carbs, 60 g fat a day'),
  ).toBeTruthy();
});

it('says when nothing was logged in the range', async () => {
  mockDays([day('2026-10-29', 0)]);
  await render(<NutritionCard today={TODAY} />);
  expect(screen.getByText('No meals logged in this range.')).toBeTruthy();
});

it('says when the meals could not load, and loads them again', async () => {
  mockDays(null, true);
  await render(<NutritionCard today={TODAY} />);
  expect(screen.getByText("We couldn't load your meals.")).toBeTruthy();
  await fireEvent.press(screen.getByText('Try again'));
  expect(refetch).toHaveBeenCalled();
});
