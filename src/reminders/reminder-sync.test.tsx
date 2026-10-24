import { AppState } from 'react-native';

import { useFinishedThisWeek } from '@/history/history';
import { act, render, waitFor } from '@/test/render';
import { useWeekMoves } from '@/workouts/moves';
import type { WorkoutMove } from '@/workouts/week-schedule';
import { useWeek, type WeekSession } from '@/workouts/workouts';

import { ReminderSync } from './reminder-sync';
import { scheduleReminders } from './reminders';
import { loadReminderMinutes } from './settings';

jest.mock('@/workouts/workouts', () => ({ useWeek: jest.fn() }));
jest.mock('@/workouts/moves', () => ({ useWeekMoves: jest.fn() }));
jest.mock('@/history/history', () => ({ useFinishedThisWeek: jest.fn() }));
jest.mock('./reminders', () => ({
  REMINDER_DAYS: 28,
  scheduleReminders: jest.fn(() => Promise.resolve()),
}));
jest.mock('./settings', () => ({ loadReminderMinutes: jest.fn() }));

// Wednesday, October 21.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const session = (workoutId: number, weekday: number, name: string, exercises = 0): WeekSession => ({
  workoutId,
  weekday,
  name,
  type: null,
  exercises: Array.from({ length: exercises }, () => ({
    exerciseId: 'bench',
    primaryMuscles: [],
    imagePath: null,
    sets: 3,
    target: { reps: { min: 8, max: 12 } },
    restSeconds: 90,
  })),
  estimatedMinutes: 45,
});

// Push on Mondays and Thursdays, Cardio on Thursdays.
const SESSIONS = [session(1, 1, 'Push', 6), session(1, 4, 'Push', 6), session(2, 4, 'Cardio', 1)];

function mockWeek(moves: WorkoutMove[] = [], loaded = true) {
  jest
    .mocked(useWeek)
    .mockReturnValue({ data: loaded ? { sessions: SESSIONS } : undefined } as never);
  jest.mocked(useWeekMoves).mockReturnValue({ data: loaded ? moves : undefined } as never);
  jest.mocked(useFinishedThisWeek).mockReturnValue({ data: loaded ? [] : undefined } as never);
}

const scheduled = () => jest.mocked(scheduleReminders).mock.calls.at(-1)?.[0] ?? [];

describe('ReminderSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
    jest.mocked(loadReminderMinutes).mockReturnValue(18 * 60);
  });
  afterEach(() => jest.useRealTimers());

  it('schedules a reminder for each day with workouts in the coming four weeks', async () => {
    mockWeek();
    await render(<ReminderSync />);
    await waitFor(() => expect(scheduleReminders).toHaveBeenCalledTimes(1));
    expect(scheduleReminders).toHaveBeenCalledWith(expect.any(Array), 18 * 60);
    // Thursdays and Mondays from Thursday, October 22, to Monday, November 16.
    expect(scheduled().map((reminder) => reminder.date)).toEqual([
      '2026-10-22',
      '2026-10-26',
      '2026-10-29',
      '2026-11-02',
      '2026-11-05',
      '2026-11-09',
      '2026-11-12',
      '2026-11-16',
    ]);
  });

  it('follows a move this week, and schedules again when the week changes', async () => {
    mockWeek();
    const { rerender } = await render(<ReminderSync />);
    await waitFor(() => expect(scheduleReminders).toHaveBeenCalledTimes(1));
    mockWeek([{ workoutId: 1, fromOn: '2026-10-22', toOn: '2026-10-24' }]);
    await rerender(<ReminderSync />);
    await waitFor(() => expect(scheduleReminders).toHaveBeenCalledTimes(2));
    expect(scheduled().slice(0, 3)).toEqual([
      expect.objectContaining({ date: '2026-10-22', title: 'Today: Cardio' }),
      expect.objectContaining({ date: '2026-10-24', title: 'Today: Push' }),
      // The next week is back on the plan's days.
      expect.objectContaining({ date: '2026-10-26', title: 'Today: Push' }),
    ]);
    // The same reminders are not scheduled again.
    await rerender(<ReminderSync />);
    expect(scheduleReminders).toHaveBeenCalledTimes(2);
  });

  it('starts from the new day when the app comes back on it', async () => {
    mockWeek();
    let listener: (state: string) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    await render(<ReminderSync />);
    await waitFor(() => expect(scheduleReminders).toHaveBeenCalledTimes(1));
    jest.setSystemTime(new Date(2026, 9, 23, 9, 0));
    await act(() => listener('active'));
    await waitFor(() => expect(scheduleReminders).toHaveBeenCalledTimes(2));
    expect(scheduled()[0]?.date).toBe('2026-10-26');
  });

  it('does nothing while reminders are off or the week has not loaded', async () => {
    mockWeek([], false);
    const { rerender } = await render(<ReminderSync />);
    jest.mocked(loadReminderMinutes).mockReturnValue(null);
    mockWeek();
    await rerender(<ReminderSync />);
    expect(scheduleReminders).not.toHaveBeenCalled();
  });
});
