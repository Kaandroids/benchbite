import { act, fireEvent, render, screen } from '@/test/render';

import { SAVE_DELAY_MS, WeightCard } from './weight-card';
import { useLogWeight, useWeightHistory, type WeightEntry } from './weights';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./weights', () => ({
  ...jest.requireActual('./weights'),
  useLogWeight: jest.fn(),
  useWeightHistory: jest.fn(),
}));

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);
const TODAYS: WeightEntry = { weightKg: 80, measuredOn: '2026-10-21' };
const MONDAYS: WeightEntry = { weightKg: 80, measuredOn: '2026-10-19' };

const mutate = jest.fn();
const reset = jest.fn();

function mockLog(log = { isError: false, isPending: false }) {
  jest.mocked(useLogWeight).mockReturnValue({ mutate, reset, ...log } as never);
}

function mockHistory(entries: WeightEntry[] = [MONDAYS]) {
  jest.mocked(useWeightHistory).mockReturnValue({ data: entries, isPending: false } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  mockLog();
  mockHistory();
});
afterEach(() => jest.useRealTimers());

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

it('says when no weight is logged', async () => {
  await render(<WeightCard latest={null} unit="kg" today={WEDNESDAY} />);
  expect(screen.getByText('No weight logged yet.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Increase weight' })).toBeNull();
});

it("shows today's weight", async () => {
  await render(<WeightCard latest={TODAYS} unit="kg" today={WEDNESDAY} />);
  expect(screen.getByText('80 kg')).toBeTruthy();
  expect(screen.getByText('Logged today')).toBeTruthy();
});

it('shows the day of an earlier weight, in the unit of the user', async () => {
  await render(<WeightCard latest={MONDAYS} unit="lb" today={WEDNESDAY} />);
  expect(screen.getByText('176.4 lb')).toBeTruthy();
  expect(screen.getByText('Logged on Oct 19, 2026')).toBeTruthy();
});

it('changes the weight a tenth of a kilogram per press and saves it once after the last', async () => {
  await render(<WeightCard latest={MONDAYS} unit="kg" today={WEDNESDAY} />);
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
  mutate.mockImplementation((_kg: number, { onSettled }: { onSettled: () => void }) => onSettled());
  await render(<WeightCard latest={TODAYS} unit="kg" today={WEDNESDAY} />);
  await press('Decrease weight');
  await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
  // The latest weight given to the card is still the old one.
  expect(screen.getByText('80 kg')).toBeTruthy();
});

it('saves a waiting change when the card closes', async () => {
  const { unmount } = await render(<WeightCard latest={TODAYS} unit="kg" today={WEDNESDAY} />);
  await press('Increase weight');
  await act(() => unmount());
  expect(mutate).toHaveBeenCalledWith(80.1, expect.anything());
});

it('stays within the weights the database accepts', async () => {
  await render(
    <WeightCard latest={{ weightKg: 30, measuredOn: '2026-10-21' }} unit="kg" today={WEDNESDAY} />,
  );
  await press('Decrease weight');
  expect(screen.getByText('30 kg')).toBeTruthy();
});

it('says when saving failed', async () => {
  mockLog({ isError: true, isPending: false });
  await render(<WeightCard latest={TODAYS} unit="kg" today={WEDNESDAY} />);
  expect(
    screen.getByText("We couldn't save your weight. Check your connection and try again."),
  ).toBeTruthy();
});

it('keeps a later change while an earlier one is saved (#153)', async () => {
  let settle = () => {};
  mutate.mockImplementationOnce((_kg: number, { onSettled }: { onSettled: () => void }) => {
    settle = onSettled;
  });
  await render(<WeightCard latest={TODAYS} unit="kg" today={WEDNESDAY} />);
  await press('Increase weight');
  await act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
  await press('Increase weight');
  // The first save settles while the second change waits: the card keeps showing it.
  await act(() => settle());
  expect(screen.getByText('80.2 kg')).toBeTruthy();
});

it('says how much the weight changed in the range, toward the target', async () => {
  mockHistory([
    { weightKg: 86.4, measuredOn: '2026-08-01' },
    { weightKg: 85, measuredOn: '2026-10-21' },
  ]);
  await render(
    <WeightCard
      latest={{ weightKg: 85, measuredOn: '2026-10-21' }}
      unit="kg"
      today={WEDNESDAY}
      goal={{ goal: 'lose_fat', targetKg: 80, paceKg: 0.5 }}
    />,
  );
  expect(screen.getByText('1.4 kg in 3 months')).toHaveStyle({ color: '#15803D' });
  expect(screen.getByLabelText('Your weight over 2 entries')).toBeTruthy();
});

it('changes the range of the chart', async () => {
  await render(<WeightCard latest={TODAYS} unit="kg" today={WEDNESDAY} />);
  await fireEvent.press(screen.getByText('Year'));
  expect(useWeightHistory).toHaveBeenLastCalledWith('year', WEDNESDAY);
});

it('says when the range has no weight', async () => {
  mockHistory([]);
  await render(<WeightCard latest={MONDAYS} unit="kg" today={WEDNESDAY} />);
  expect(screen.getByText('No weight logged in this range.')).toBeTruthy();
});
