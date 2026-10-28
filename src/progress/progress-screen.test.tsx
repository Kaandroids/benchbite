import { fireEvent, render, screen } from '@/test/render';
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

type Weight = { weightKg: number; measuredOn: string } | null;

function mockData({
  weight = loaded<Weight>({ weightKg: 80, measuredOn: '2026-10-19' }),
  unit = loaded<'kg' | 'lb'>('kg'),
}: {
  weight?: Query<Weight>;
  unit?: Query<'kg' | 'lb'>;
} = {}) {
  jest.mocked(useLatestWeight).mockReturnValue(weight as never);
  jest.mocked(useWeightUnit).mockReturnValue(unit as never);
  jest.mocked(useLogWeight).mockReturnValue({
    mutate: jest.fn(),
    reset: jest.fn(),
    isError: false,
    isPending: false,
  } as never);
  return { weight, unit };
}

beforeEach(() => jest.clearAllMocks());

it('shows the tab with the settings and the latest weight in the unit of the user', async () => {
  mockData({ unit: loaded<'kg' | 'lb'>('lb') });
  await render(<ProgressScreen />);
  expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  expect(screen.getByText('176.4 lb')).toBeTruthy();
});

it('shows the weight card for a user with no weight yet', async () => {
  mockData({ weight: loaded<Weight>(null) });
  await render(<ProgressScreen />);
  expect(screen.getByText('No weight logged yet.')).toBeTruthy();
});

it('shows an error and loads only what failed again', async () => {
  const { weight, unit } = mockData({ weight: failed() });
  await render(<ProgressScreen />);
  expect(screen.queryByText('Weight')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(weight.refetch).toHaveBeenCalled();
  expect(unit.refetch).not.toHaveBeenCalled();
});
