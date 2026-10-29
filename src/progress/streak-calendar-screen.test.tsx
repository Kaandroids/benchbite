import { router } from 'expo-router';

import { useMonthStreak, useStreak, useStreakStart } from '@/streak/use-streak';
import { fireEvent, render, screen } from '@/test/render';

import { StreakButton } from './streak-button';
import { StreakCalendarScreen } from './streak-calendar-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/streak/use-streak', () => ({
  useStreak: jest.fn(),
  useStreakStart: jest.fn(),
  useMonthStreak: jest.fn(),
}));

const TODAY = new Date(2026, 9, 29, 9, 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: TODAY });
  jest.mocked(useStreak).mockReturnValue({
    streak: { count: 12, doneToday: true, days: {} },
    freezes: 2,
  } as never);
  jest.mocked(useStreakStart).mockReturnValue({ data: '2026-09-14' } as never);
  jest.mocked(useMonthStreak).mockReturnValue({
    data: {
      '2026-10-25': 'done',
      '2026-10-26': 'frozen',
      '2026-10-27': 'done',
      '2026-10-28': 'missed',
      '2026-10-29': 'done',
    },
  } as never);
});

describe('StreakCalendarScreen', () => {
  it('marks each day of the month and sums the month up', async () => {
    await render(<StreakCalendarScreen />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByLabelText('25, counted for the streak')).toBeTruthy();
    expect(screen.getByLabelText('26, frozen')).toBeTruthy();
    expect(screen.getByLabelText('28, missed')).toBeTruthy();
    // Before the streak's days and after today, a day has no state.
    expect(screen.getByLabelText('30')).toBeTruthy();
    expect(screen.getByText('2 freezes left')).toBeTruthy();
  });

  it('pages back to the month the streak started in, and forward to this one', async () => {
    await render(<StreakCalendarScreen />);
    expect(screen.getByLabelText('Next month')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(useMonthStreak).toHaveBeenLastCalledWith(TODAY, new Date(2026, 8, 1));
    expect(screen.getByLabelText('Previous month')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('October 2026')).toBeTruthy();
  });
});

describe('StreakCalendarScreen while loading', () => {
  it("shows nothing of a month until its days load, not the last month's", async () => {
    await render(<StreakCalendarScreen />);
    jest.mocked(useMonthStreak).mockReturnValue({ data: undefined, isError: false } as never);
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('days counted')).toBeNull();
  });

  it('says when the days could not load, and loads them again', async () => {
    const refetch = jest.fn();
    jest
      .mocked(useMonthStreak)
      .mockReturnValue({ data: undefined, isError: true, refetch } as never);
    await render(<StreakCalendarScreen />);
    expect(screen.getByText("We couldn't load your streak.")).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('StreakButton', () => {
  it('says the streak and the freezes left, and opens the calendar', async () => {
    await render(<StreakButton today={TODAY} />);
    expect(screen.getByText('12-day streak · 2 freezes left')).toBeTruthy();
    await fireEvent.press(screen.getByText('Streak calendar'));
    expect(router.push).toHaveBeenCalledWith('/progress/streak');
  });
});
