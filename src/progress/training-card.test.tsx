import { fireEvent, render, screen } from '@/test/render';
import { useDayTraining, type DayTraining } from '@/history/day-training';

import { TrainingCard } from './training-card';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/history/day-training', () => ({
  ...jest.requireActual('@/history/day-training'),
  useDayTraining: jest.fn(),
}));

const TODAY = new Date(2026, 9, 29, 9, 0);

const day = (date: string, minutes: number, liftedKg = 0, done = 0, missed = 0): DayTraining => ({
  day: date,
  minutes,
  liftedKg,
  done,
  missed,
});

const refetch = jest.fn();

/** The range shown, then the one before it. */
function mockDays(days: DayTraining[] | null, before: DayTraining[] = [], isError = false) {
  jest
    .mocked(useDayTraining)
    .mockImplementation(
      (_today, from) =>
        (from.getTime() === TODAY_START.getTime()
          ? { data: days ?? undefined, isError, refetch }
          : { data: before, isError: false, refetch }) as never,
    );
}
const TODAY_START = new Date(2026, 6, 29);

beforeEach(() => jest.clearAllMocks());

it('sums up three months of training against the plan and the range before', async () => {
  mockDays(
    [
      day('2026-10-26', 90, 2500, 1),
      day('2026-10-27', 0, 0, 0, 1),
      day('2026-10-28', 45, 1500, 1),
      day('2026-10-29', 0),
    ],
    [day('2026-07-20', 60, 3200, 1)],
  );
  await render(<TrainingCard today={TODAY} />);
  expect(useDayTraining).toHaveBeenCalledWith(TODAY, TODAY_START, TODAY);
  expect(useDayTraining).toHaveBeenCalledWith(TODAY, new Date(2026, 3, 28), new Date(2026, 6, 28));
  expect(screen.getByText('2 of 3 workouts')).toBeTruthy();
  expect(screen.getByLabelText('2 days trained, 1 with a planned workout missed')).toBeTruthy();
  expect(screen.getByText('67%')).toBeTruthy();
  expect(screen.getByText('2.3 h')).toBeTruthy();
  expect(screen.getByText('4 t')).toBeTruthy();
  expect(screen.getByText('+25%')).toBeTruthy();
});

it('gives short times in minutes and light weights in kilograms', async () => {
  mockDays([day('2026-10-28', 45, 640)]);
  await render(<TrainingCard today={TODAY} />);
  expect(screen.getByText('45 min')).toBeTruthy();
  expect(screen.getByText('640 kg')).toBeTruthy();
  // Without a plan there is nothing to have done of it.
  expect(screen.getByText('–')).toBeTruthy();
  expect(screen.queryByText(/workouts$/)).toBeNull();
});

it('loads the range chosen, from three months', async () => {
  mockDays([day('2026-10-28', 45)]);
  await render(<TrainingCard today={TODAY} />);
  await fireEvent.press(screen.getByText('Year'));
  expect(useDayTraining).toHaveBeenCalledWith(TODAY, new Date(2025, 9, 29), TODAY);
  // A month is too short for the map.
  expect(screen.queryByText('1M')).toBeNull();
});

it('says when there was no training in the range', async () => {
  mockDays([day('2026-10-29', 0)]);
  await render(<TrainingCard today={TODAY} />);
  expect(screen.getByText('No workouts in this range.')).toBeTruthy();
});

it('says when the workouts could not load, and loads them again', async () => {
  mockDays(null, [], true);
  await render(<TrainingCard today={TODAY} />);
  expect(screen.getByText("We couldn't load your workouts.")).toBeTruthy();
  await fireEvent.press(screen.getByText('Try again'));
  expect(refetch).toHaveBeenCalled();
});
