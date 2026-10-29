import { fireEvent, render, screen } from '@/test/render';

import { useMoveWorkout } from '@/workouts/moves';
import { weekSchedule } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { BreakSheet } from './break-sheet';
import type { MissedDay, StreakBreak } from './streak';
import { useAnswerBreak } from './use-streak';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./use-streak', () => ({ useAnswerBreak: jest.fn() }));
jest.mock('@/workouts/moves', () => ({ useMoveWorkout: jest.fn() }));

// A Thursday.
const TODAY = new Date(2026, 9, 29, 9, 0);
const answer = jest.fn();
const move = jest.fn();

// Lower body on Wednesday of this week, not done.
const LOWER: WeekSession = {
  workoutId: 7,
  weekday: 3,
  name: 'Lower body',
  type: null,
  exercises: [],
  estimatedMinutes: 45,
};
const SCHEDULE = weekSchedule([LOWER], [], [], TODAY);

/** A missed day that only its meals kept from counting, unless said otherwise. */
const missedDay = (day: string, change: Partial<MissedDay> = {}): MissedDay => ({
  day,
  workouts: [],
  eaten: 0,
  target: 2000,
  caloriesCount: false,
  ...change,
});
const breakOf = (days: MissedDay[], freezes: number, savedCount: number): StreakBreak => ({
  missed: days.map(({ day }) => day),
  days,
  freezes,
  savedCount,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useAnswerBreak)
    .mockReturnValue({ mutate: answer, isPending: false, isError: false } as never);
  jest
    .mocked(useMoveWorkout)
    .mockReturnValue({ mutate: move, isPending: false, isError: false } as never);
});

describe('BreakSheet', () => {
  it('freezes the missed days when the freezes cover them', async () => {
    const onAnswered = jest.fn();
    await render(
      <BreakSheet
        streakBreak={breakOf([missedDay('2026-10-26'), missedDay('2026-10-27')], 3, 9)}
        today={TODAY}
        schedule={SCHEDULE}
        onLog={jest.fn()}
        onAnswered={onAnswered}
      />,
    );
    expect(screen.getByText("2 days didn't count.")).toBeTruthy();
    expect(screen.getByText('You have 3 freezes')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Use 2 freezes, keep 9 days' }));
    expect(answer).toHaveBeenCalledWith({ today: TODAY, useFreezes: true }, expect.anything());
    answer.mock.calls[0][1].onSuccess();
    expect(onAnswered).toHaveBeenCalledWith('Streak kept: 2 days frozen. 1 freeze left.');
  });

  it('starts again when asked', async () => {
    const onAnswered = jest.fn();
    await render(
      <BreakSheet
        streakBreak={breakOf([missedDay('2026-10-28')], 1, 4)}
        today={TODAY}
        schedule={SCHEDULE}
        onLog={jest.fn()}
        onAnswered={onAnswered}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Start again' }));
    expect(answer).toHaveBeenCalledWith({ today: TODAY, useFreezes: false }, expect.anything());
    answer.mock.calls[0][1].onSuccess();
    expect(onAnswered).toHaveBeenCalledWith(null);
  });

  it('offers only a new streak without enough freezes, and logs the days still open', async () => {
    const onLog = jest.fn();
    await render(
      <BreakSheet
        streakBreak={breakOf(
          ['2026-10-19', '2026-10-20', '2026-10-26', '2026-10-27'].map((day) => missedDay(day)),
          3,
          14,
        )}
        today={TODAY}
        schedule={SCHEDULE}
        onLog={onLog}
        onAnswered={jest.fn()}
      />,
    );
    expect(
      screen.getByText("4 days didn't count. You have 3 freezes: not enough to cover them all."),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /freeze/ })).toBeNull();
    expect(screen.getAllByText('Can no longer be logged')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Log Mon, Oct 26' }));
    expect(onLog).toHaveBeenCalledWith('2026-10-26');
    await fireEvent.press(screen.getByRole('button', { name: 'Start a new streak' }));
    expect(answer).toHaveBeenCalledWith({ today: TODAY, useFreezes: false }, expect.anything());
  });

  it('says when there are no freezes left, and keeps one day in the singular', async () => {
    await render(
      <BreakSheet
        streakBreak={breakOf([missedDay('2026-10-28')], 0, 1)}
        today={TODAY}
        schedule={SCHEDULE}
        onLog={jest.fn()}
        onAnswered={jest.fn()}
      />,
    );
    expect(
      screen.getByText("Wednesday, October 28 didn't count. You have no freezes left."),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a new streak' })).toBeTruthy();
  });

  it('keeps a single day in the singular', async () => {
    await render(
      <BreakSheet
        streakBreak={breakOf([missedDay('2026-10-28')], 1, 1)}
        today={TODAY}
        schedule={SCHEDULE}
        onLog={jest.fn()}
        onAnswered={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Use 1 freeze, keep 1 day' })).toBeTruthy();
  });

  it('says what kept each day, and offers to postpone a workout of this week', async () => {
    const onAnswered = jest.fn();
    await render(
      <BreakSheet
        streakBreak={breakOf(
          [
            missedDay('2026-10-25', {
              workouts: [{ id: 3, name: 'Push', type: null, skipped: false }],
              eaten: 1500,
              caloriesCount: true,
            }),
            missedDay('2026-10-28', {
              workouts: [{ id: 7, name: 'Lower body', type: null, skipped: false }],
              eaten: 2240,
            }),
          ],
          3,
          9,
        )}
        today={TODAY}
        schedule={SCHEDULE}
        onLog={jest.fn()}
        onAnswered={onAnswered}
      />,
    );
    expect(screen.getByText('Push not done')).toBeTruthy();
    expect(screen.getByText('Can no longer move')).toBeTruthy();
    expect(screen.getByText('Lower body not done')).toBeTruthy();
    expect(screen.getByText('Over the target by 240 kcal')).toBeTruthy();
    expect(screen.getByText('Only a freeze')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Postpone Lower body' }));
    await fireEvent.press(screen.getByLabelText('Move Lower body to Today'));
    expect(move).toHaveBeenCalledWith(
      { workoutId: 7, fromOn: '2026-10-28', toOn: '2026-10-29' },
      expect.anything(),
    );
    move.mock.calls[0][1].onSuccess();
    expect(onAnswered).toHaveBeenCalledWith('Lower body moved to today.');
  });
});
