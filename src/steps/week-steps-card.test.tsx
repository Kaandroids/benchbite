import { render, screen } from '@/test/render';

import { useStepDays } from './steps';
import { WeekStepsCard } from './week-steps-card';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./steps', () => ({ ...jest.requireActual('./steps'), useStepDays: jest.fn() }));
jest.mock('@/health/use-store-name', () => ({ useStoreName: () => 'Apple Health' }));

// A Wednesday.
const TODAY = new Date(2026, 10, 11, 9, 0);

const mockDays = (data: { day: string; steps: number }[] | undefined, isError = false) =>
  jest.mocked(useStepDays).mockReturnValue({ data, isError, refetch: jest.fn() } as never);

beforeEach(() => jest.clearAllMocks());

it("shows today's steps, the week from Monday and its average a day", async () => {
  mockDays([
    { day: '2026-11-09', steps: 8120 },
    { day: '2026-11-10', steps: 5430 },
    { day: '2026-11-11', steps: 6248 },
  ]);
  await render(<WeekStepsCard today={TODAY} />);

  expect(screen.getByText('6,248 steps today')).toBeOnTheScreen();
  expect(screen.getByText('From Apple Health')).toBeOnTheScreen();
  // Today is still being counted, so the average is of Monday and Tuesday.
  expect(screen.getByText('6,775 a day on average this week')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Steps this week: Monday 8,120, Tuesday 5,430, Wednesday 6,248'),
  ).toBeOnTheScreen();
  expect(useStepDays).toHaveBeenCalledWith(new Date(2026, 10, 9), TODAY);
});

it('counts today as none before the store counted a step', async () => {
  mockDays([{ day: '2026-11-09', steps: 8120 }]);
  await render(<WeekStepsCard today={TODAY} />);

  expect(screen.getByText('0 steps today')).toBeOnTheScreen();
});

it('says when the week has no steps yet', async () => {
  mockDays([]);
  await render(<WeekStepsCard today={TODAY} />);

  expect(screen.getByText('No steps yet today')).toBeOnTheScreen();
  expect(screen.getByText('They show here once Apple Health counts them.')).toBeOnTheScreen();
});

it('says when the steps could not load', async () => {
  mockDays(undefined, true);
  await render(<WeekStepsCard today={TODAY} />);

  expect(screen.getByText('Your steps could not load.')).toBeOnTheScreen();
});

it('shows no average before the week has a day that is over', async () => {
  // A Monday.
  const monday = new Date(2026, 10, 9, 8, 0);
  mockDays([{ day: '2026-11-09', steps: 500 }]);
  await render(<WeekStepsCard today={monday} />);

  expect(screen.getByText('500 steps today')).toBeOnTheScreen();
  expect(screen.queryByText(/on average this week/)).toBeNull();
});
