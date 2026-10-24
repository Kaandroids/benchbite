import { render, screen } from '@/test/render';
import { NO_STREAK } from '@/streak/streak';
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

const renderWeek = (
  sessions: WeekSession[],
  moves: WorkoutMove[] = [],
  finished: FinishedWorkout[] = [],
) =>
  render(
    <WeekCard
      today={WEDNESDAY}
      streak={NO_STREAK}
      schedule={weekSchedule(sessions, moves, finished, WEDNESDAY)}
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
});
