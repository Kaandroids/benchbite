import { act, fireEvent, render, screen } from '@/test/render';
import { SAVE_DELAY_MS } from '@/weight/weight-card';
import { useLatestWeight, useLogWeight, useWeightUnit } from '@/weight/weights';

import { ProgressScreen } from './progress-screen';

jest.mock('@/weight/weights', () => ({
  useLatestWeight: jest.fn(),
  useLogWeight: jest.fn(),
  useWeightUnit: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

type Query<T> = {
  data?: T;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: jest.Mock;
};

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});
const failed = <T,>(): Query<T> => ({
  isPending: false,
  isError: true,
  isFetching: false,
  refetch: jest.fn(),
});

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

type Weight = { weightKg: number; measuredOn: string } | null;

const mutate = jest.fn();
const reset = jest.fn();

function mockData({
  weight = loaded<Weight>({ weightKg: 80, measuredOn: '2026-10-21' }),
  unit = loaded<'kg' | 'lb'>('kg'),
  log = { isError: false, isPending: false },
}: {
  weight?: Query<Weight>;
  unit?: Query<'kg' | 'lb'>;
  log?: { isError: boolean; isPending: boolean };
} = {}) {
  jest.mocked(useLatestWeight).mockReturnValue(weight as never);
  jest.mocked(useWeightUnit).mockReturnValue(unit as never);
  jest.mocked(useLogWeight).mockReturnValue({ mutate, reset, ...log } as never);
  return { weight, unit };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
});
afterEach(() => jest.useRealTimers());

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

it('shows the tab with the settings and the weight', async () => {
  mockData();
  await render(<ProgressScreen />);
  expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  expect(screen.getByText('Weight')).toBeTruthy();
});

it('shows an error and loads only what failed again', async () => {
  const { weight, unit } = mockData({ weight: failed() });
  await render(<ProgressScreen />);
  await press('Try again');
  expect(weight.refetch).toHaveBeenCalled();
  expect(unit.refetch).not.toHaveBeenCalled();
});

it('says when no weight is logged', async () => {
  mockData({ weight: loaded<Weight>(null) });
  await render(<ProgressScreen />);
  expect(screen.getByText('No weight logged yet.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Increase weight' })).toBeNull();
});

it("shows today's weight", async () => {
  mockData();
  await render(<ProgressScreen />);
  expect(screen.getByText('80 kg')).toBeTruthy();
  expect(screen.getByText('Logged today')).toBeTruthy();
});

it('shows the day of an earlier weight, in the unit of the user', async () => {
  mockData({
    weight: loaded<Weight>({ weightKg: 80, measuredOn: '2026-10-19' }),
    unit: loaded<'kg' | 'lb'>('lb'),
  });
  await render(<ProgressScreen />);
  expect(screen.getByText('176.4 lb')).toBeTruthy();
  expect(screen.getByText('Logged on Oct 19, 2026')).toBeTruthy();
});

it('changes the weight a tenth of a kilogram per press and saves it once after the last', async () => {
  mockData({ weight: loaded<Weight>({ weightKg: 80, measuredOn: '2026-10-19' }) });
  await render(<ProgressScreen />);
  await press('Increase weight');
  await press('Increase weight');
  await press('Increase weight');
  await press('Decrease weight');
  expect(screen.getByText('80.2 kg')).toBeTruthy();
  expect(screen.getByText('Logged today')).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledWith(80.2, expect.anything());
});

it('shows the saved weight once it is loaded again', async () => {
  mockData();
  mutate.mockImplementation((_kg: number, { onSettled }: { onSettled: () => void }) => onSettled());
  await render(<ProgressScreen />);
  await press('Decrease weight');
  await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
  // The mocked query still returns the old weight.
  expect(screen.getByText('80 kg')).toBeTruthy();
});

it('saves a waiting change when the screen closes', async () => {
  mockData();
  const { unmount } = await render(<ProgressScreen />);
  await press('Increase weight');
  await act(() => unmount());
  expect(mutate).toHaveBeenCalledWith(80.1, expect.anything());
});

it('stays within the weights the database accepts', async () => {
  mockData({ weight: loaded<Weight>({ weightKg: 30, measuredOn: '2026-10-21' }) });
  await render(<ProgressScreen />);
  await press('Decrease weight');
  expect(screen.getByText('30 kg')).toBeTruthy();
});

it('says when saving failed', async () => {
  mockData({ log: { isError: true, isPending: false } });
  await render(<ProgressScreen />);
  expect(
    screen.getByText("We couldn't save your weight. Check your connection and try again."),
  ).toBeTruthy();
});
