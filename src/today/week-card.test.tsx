import { fireEvent, render, screen } from '@/test/render';
import { weekSchedule, type FinishedWorkout, type WorkoutMove } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { WeekCard } from './week-card';

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const session = (workoutId: number, weekday: number, type: WeekSession['type']): WeekSession => ({
  workoutId,
  weekday,
  name: null,
  type,
  exercises: [],
  estimatedMinutes: 45,
});

const onDayPress = jest.fn();

const renderWeek = (
  sessions: WeekSession[],
  moves: WorkoutMove[] = [],
  finished: FinishedWorkout[] = [],
) =>
  render(
    <WeekCard
      today={WEDNESDAY}
      schedule={weekSchedule(sessions, moves, finished, WEDNESDAY)}
      onDayPress={onDayPress}
    />,
  );

describe('WeekCard', () => {
  it("shows today's date and the week from Monday to Sunday with today selected", async () => {
    await renderWeek([]);
    expect(screen.getByText('Wednesday, October 21')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('Sun 25').props.accessibilityState).toEqual({ selected: false });
    expect(screen.queryByText(/this week/)).toBeNull();
  });

  it('marks workouts as done, missed or planned, and counts the workouts done', async () => {
    await renderWeek(
      [session(1, 1, 'push'), session(2, 2, 'pull'), session(3, 3, 'legs'), session(1, 5, 'push')],
      [],
      [
        { workoutId: 1, startedOn: '2026-10-19' },
        { workoutId: 1, startedOn: '2026-10-19' },
      ],
    );
    expect(screen.getByText('1 of 4 workouts this week')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19, Push, done, extra workout')).toBeTruthy();
    expect(screen.getByLabelText('Tue 20, Pull, missed')).toBeTruthy();
    // Today's workout is still ahead until it is finished.
    expect(screen.getByLabelText('Wed 21, Legs, planned')).toBeTruthy();
    expect(screen.getByLabelText('Fri 23, Push, planned')).toBeTruthy();
    expect(screen.getByLabelText('Sat 24')).toBeTruthy();
  });

  it('never counts more than the plan: a workout on a rest day is an extra', async () => {
    await renderWeek(
      [session(1, 1, 'push')],
      [],
      [
        { workoutId: 1, startedOn: '2026-10-19' },
        { workoutId: 1, startedOn: '2026-10-20' },
      ],
    );
    expect(screen.getByText('1 of 1 workout this week')).toBeTruthy();
    expect(screen.getByLabelText('Tue 20, extra workout')).toBeTruthy();
    expect(screen.getByTestId('day-extra')).toBeTruthy();
  });

  it('shows a moved workout on its new day and where it came from', async () => {
    await renderWeek(
      [session(1, 1, 'push'), session(2, 6, 'pull')],
      [
        { workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-21' },
        { workoutId: 2, fromOn: '2026-10-24', toOn: null },
      ],
    );
    expect(screen.getByLabelText('Mon 19, Push, moved to Wednesday')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21, Push, moved from Monday, planned')).toBeTruthy();
    expect(screen.getByLabelText('Sat 24, Pull, skipped')).toBeTruthy();
    expect(screen.getByTestId('day-movedAway')).toBeTruthy();
    expect(screen.getByTestId('day-moved-in')).toBeTruthy();
    expect(screen.getByTestId('day-skipped')).toBeTruthy();
  });

  it('shows how many of a day with several workouts are done', async () => {
    await renderWeek(
      [session(1, 4, 'legs'), session(2, 4, 'upper'), session(3, 5, 'push'), session(4, 5, 'pull')],
      [],
      [{ workoutId: 1, startedOn: '2026-10-22' }],
    );
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.getByLabelText('Thu 22, Legs, done, Upper body, planned')).toBeTruthy();
    // A day with several workouts and none done shows how many there are.
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('opens a day with workouts, but not a rest day', async () => {
    await renderWeek(
      [session(1, 1, 'push')],
      [{ workoutId: 1, fromOn: '2026-10-19', toOn: '2026-10-23' }],
    );
    // The day the workout moved away from opens too, to undo the move.
    await fireEvent.press(screen.getByLabelText('Mon 19, Push, moved to Friday'));
    expect(onDayPress).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-19' }));
    expect(screen.getByLabelText('Fri 23, Push, moved from Monday, planned')).toHaveProp(
      'accessibilityRole',
      'button',
    );
    expect(screen.getByLabelText('Tue 20')).not.toHaveProp('accessibilityRole', 'button');
  });

  it('marks the days that counted for the streak, and fades the days before the first', async () => {
    await render(
      <WeekCard
        today={WEDNESDAY}
        schedule={weekSchedule([], [], [], WEDNESDAY)}
        streakDays={{ '2026-10-20': 'done', '2026-10-21': 'frozen' }}
        startedOn="2026-10-20"
      />,
    );
    expect(screen.getByLabelText('Tue 20, counted for the streak')).toBeTruthy();
    expect(screen.getByLabelText('Wed 21, frozen')).toBeTruthy();
    expect(screen.getByTestId('streak-done')).toBeTruthy();
    expect(screen.getByTestId('streak-frozen')).toBeTruthy();
    expect(screen.getByLabelText('Mon 19')).toHaveStyle({ opacity: 0.45 });
    expect(screen.getByLabelText('Thu 22')).toHaveStyle({ opacity: 1 });
    expect(screen.getByText('your first week')).toBeTruthy();
  });

  it('titles a past week with its days, opens none of them and pages from it', async () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();
    const onBackToToday = jest.fn();
    const lastWeek = new Date(2026, 9, 14, 9, 0);
    await render(
      <WeekCard
        today={WEDNESDAY}
        schedule={weekSchedule(
          [session(1, 1, 'push'), session(2, 3, 'pull')],
          [],
          [{ workoutId: 1, startedOn: '2026-10-12' }],
          WEDNESDAY,
          lastWeek,
        )}
        onPrevious={onPrevious}
        onNext={onNext}
        onBackToToday={onBackToToday}
      />,
    );
    expect(screen.getByText('October 12 – 18')).toBeTruthy();
    expect(screen.getByText('1 of 2 workouts')).toBeTruthy();
    expect(screen.getByLabelText('Wed 14, Pull, missed').props.accessibilityRole).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('Previous week'));
    await fireEvent.press(screen.getByLabelText('Next week'));
    await fireEvent.press(screen.getByText('Back to today'));
    expect(onPrevious).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
    expect(onBackToToday).toHaveBeenCalled();
  });

  it('cannot page back from the first week', async () => {
    await render(
      <WeekCard
        today={WEDNESDAY}
        schedule={weekSchedule([], [], [], WEDNESDAY)}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Previous week')).toBeDisabled();
    expect(screen.getByLabelText('Next week')).toBeEnabled();
  });

  it('hides the days while a week loads', async () => {
    await render(
      <WeekCard today={WEDNESDAY} schedule={weekSchedule([], [], [], WEDNESDAY)} loading />,
    );
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByLabelText('Mon 19')).toBeNull();
  });
});
