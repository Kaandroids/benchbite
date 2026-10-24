import { act, fireEvent, render, screen } from '@/test/render';
import { useCachedWeekSchedule } from '@/workouts/use-week-schedule';
import { weekSchedule } from '@/workouts/week-schedule';
import type { WeekSession, Workout } from '@/workouts/workouts';

import { askStartMove, StartMoveSheet, useStartMove } from './start-move';

jest.mock('@/workouts/use-week-schedule', () => ({ useCachedWeekSchedule: jest.fn() }));

// Wednesday, October 21.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const PUSH: Workout = {
  id: 1,
  name: 'Push',
  type: null,
  weekdays: [1],
  active: true,
  estimatedMinutes: 45,
  exercises: [],
};
const MONDAY: WeekSession = { ...PUSH, workoutId: 1, weekday: 1 };

describe('StartMoveSheet', () => {
  it('asks whether a workout counts for its missed day, and answers with the choice', async () => {
    await render(<StartMoveSheet />);
    expect(screen.queryByRole('header')).toBeNull();
    let answer: Promise<unknown> = Promise.resolve();
    await act(() => {
      answer = askStartMove({ name: 'Push', fromOn: '2026-10-19', on: '2026-10-19', missed: true });
    });
    expect(screen.getByText("Do Monday's Push today?")).toBeTruthy();
    expect(
      screen.getByText(
        'Push was planned for Monday and missed. Moved to today, it counts towards this week.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Saved to your history, not counted towards the week. Monday stays missed.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Move to today' }));
    await expect(answer).resolves.toBe('move');
    expect(screen.queryByText("Do Monday's Push today?")).toBeNull();
  });

  it('names a later day as still planned, and answers extra or cancel', async () => {
    await render(<StartMoveSheet />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(() => {
      answer = askStartMove({
        name: 'Legs',
        fromOn: '2026-10-21',
        on: '2026-10-23',
        missed: false,
      });
    });
    expect(
      screen.getByText(
        'Legs is planned for Friday. Moved to today, it counts towards this week and Friday is free.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Extra workout' }));
    await expect(answer).resolves.toBe('extra');

    await act(() => {
      answer = askStartMove({
        name: 'Legs',
        fromOn: '2026-10-21',
        on: '2026-10-23',
        missed: false,
      });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBeNull();
  });

  it('answers a question left open when the sheet goes with null', async () => {
    await render(<StartMoveSheet />);
    let answer: Promise<unknown> = Promise.resolve();
    await act(() => {
      answer = askStartMove({ name: 'Push', fromOn: '2026-10-19', on: '2026-10-19', missed: true });
    });
    await screen.unmount();
    await expect(answer).resolves.toBeNull();
  });
});

describe('useStartMove', () => {
  let startMove: ReturnType<typeof useStartMove>;
  function Harness() {
    startMove = useStartMove();
    return <StartMoveSheet />;
  }

  it('asks about the missed day, and moves from it when the answer is to move', async () => {
    jest
      .mocked(useCachedWeekSchedule)
      .mockReturnValue(() => weekSchedule([MONDAY], [], [], WEDNESDAY));
    await render(<Harness />);
    let choice: Promise<unknown> = Promise.resolve();
    await act(() => {
      choice = startMove(PUSH, WEDNESDAY);
    });
    expect(screen.getByText("Do Monday's Push today?")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Move to today' }));
    await expect(choice).resolves.toEqual({ fromOn: '2026-10-19' });
  });

  it('starts an extra workout, or not at all when cancelled', async () => {
    jest
      .mocked(useCachedWeekSchedule)
      .mockReturnValue(() => weekSchedule([MONDAY], [], [], WEDNESDAY));
    await render(<Harness />);
    let choice: Promise<unknown> = Promise.resolve();
    await act(() => {
      choice = startMove(PUSH, WEDNESDAY);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Extra workout' }));
    await expect(choice).resolves.toEqual({});
    await act(() => {
      choice = startMove(PUSH, WEDNESDAY);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await expect(choice).resolves.toBeNull();
  });

  it('does not ask without the week or a planned day to count for', async () => {
    let week: ReturnType<typeof weekSchedule> | undefined;
    jest.mocked(useCachedWeekSchedule).mockReturnValue(() => week);
    await render(<Harness />);
    await expect(startMove(PUSH, WEDNESDAY)).resolves.toEqual({});
    week = weekSchedule([], [], [], WEDNESDAY);
    await expect(startMove(PUSH, WEDNESDAY)).resolves.toEqual({});
    expect(screen.queryByRole('header')).toBeNull();
  });
});
