import { router } from 'expo-router';
import { Alert } from 'react-native';

import { endSession, useActiveSession, type Session } from '@/sessions/session';
import { useStartWorkout } from '@/sessions/start';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { ArchiveScreen } from './archive-screen';
import { testExercise, testWorkout } from './test-data';
import { WorkoutScreen } from './workout-screen';
import { useSetWorkoutActive, useWorkoutLimits, useWorkouts, type Workout } from './workouts';
import { WorkoutsScreen } from './workouts-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkouts: jest.fn(),
  useSetWorkoutActive: jest.fn(),
  useWorkoutLimits: jest.fn(),
  useKcalPerMinute: () => ({ data: 7.5 }),
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));
jest.mock('@/history/history', () => ({
  ...jest.requireActual<typeof import('@/history/history')>('@/history/history'),
  useRecentLogs: () => ({
    data: { latest: [], thisWeek: 0 },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
}));
jest.mock('@/sessions/start', () => ({ useStartWorkout: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('@/sessions/session', () => ({
  ...jest.requireActual<typeof import('@/sessions/session')>('@/sessions/session'),
  useActiveSession: jest.fn(),
  endSession: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  useExerciseLibrary: () => ({
    data: ['pulldown', 'rope', 'row', 'bench', 'squat'].map((id) => ({
      id,
      name: `Name of ${id}`,
    })),
  }),
}));

const mutate = jest.fn();
const refetch = jest.fn();

function mockWorkouts(data: Workout[] | undefined, state: { isError?: boolean } = {}) {
  jest.mocked(useWorkouts).mockReturnValue({
    data,
    isPending: data === undefined && !state.isError,
    isError: state.isError ?? false,
    isFetching: false,
    refetch,
  } as never);
}

// A Wednesday.
const WEDNESDAY = new Date(2026, 9, 21, 9, 0);

const startWorkout = jest.fn();

/** Push in progress for 23 minutes, with one of its two sets done. */
const RUNNING: Session = {
  userId: 'user-a',
  workoutId: 4,
  name: null,
  type: 'push',
  startedAt: Date.now(),
  exercises: [
    {
      exerciseId: 'bench',
      target: { reps: { min: 8, max: 12 } },
      restSeconds: 90,
      last: [],
      sets: [
        { weightKg: 80, reps: 8, seconds: null, meters: null, done: true },
        { weightKg: 80, reps: 8, seconds: null, meters: null, done: false },
      ],
    },
  ],
  current: 0,
  rest: null,
  clock: null,
  planned: { exercises: 1, sets: 2 },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  jest.mocked(useSetWorkoutActive).mockReturnValue({ mutate } as never);
  jest.mocked(useStartWorkout).mockReturnValue(startWorkout);
  jest.mocked(useActiveSession).mockReturnValue(null);
  jest.mocked(useWorkoutLimits).mockReturnValue({ data: { exercises: 20, workouts: 2 } } as never);
});
afterEach(() => jest.useRealTimers());

describe('WorkoutsScreen', () => {
  it('lists the active workouts with their days and size, today highlighted', async () => {
    mockWorkouts([
      testWorkout(1, { type: 'push', weekdays: [1] }),
      testWorkout(2, { type: 'pull', weekdays: [3, 6] }),
      testWorkout(3, { type: 'legs', weekdays: [] }),
      testWorkout(4, { type: 'upper', active: false }),
    ]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('Active · 3')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText('Sat')).toBeTruthy();
    expect(screen.getByText('Any day')).toBeTruthy();
    // Each has one exercise of three sets, estimated at 45 minutes and 7.5 kcal a minute.
    expect(screen.getAllByLabelText('1 exercise')).toHaveLength(3);
    expect(screen.getAllByLabelText('3 sets')).toHaveLength(3);
    expect(screen.getAllByText('~45 min')).toHaveLength(3);
    expect(screen.getAllByText('~338 kcal')).toHaveLength(3);
    // Only the workout on Wednesday is today's.
    expect(screen.getAllByText('Today')).toHaveLength(1);
    // Inactive workouts are in the archive.
    expect(screen.queryByText('Upper body')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Start / })).toHaveLength(3);
  });

  it('shows the empty history until workouts can be logged', async () => {
    mockWorkouts([testWorkout(1)]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Your finished workouts will show here.')).toBeTruthy();
  });

  it('says when no workout is active', async () => {
    mockWorkouts([testWorkout(1, { active: false })]);
    await render(<WorkoutsScreen />);
    expect(screen.getByText('Active · 0')).toBeTruthy();
    expect(screen.getByText('No active workouts. Switch one on in the archive.')).toBeTruthy();
  });

  it('opens a workout and the archive', async () => {
    mockWorkouts([testWorkout(5, { type: 'pull' })]);
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pull' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/[id]',
      params: { id: '5' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    expect(router.push).toHaveBeenCalledWith('/workout/archive');
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    expect(router.push).toHaveBeenCalledWith('/workout/edit');
  });

  it('says when there is no room for another workout, counting the archive', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockWorkouts([testWorkout(5, { type: 'pull' }), testWorkout(6, { active: false })]);
    await render(<WorkoutsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'New workout' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'No room for another workout',
      'You can have up to 2 workouts, archived ones included. Delete one to make room.',
    );
  });

  it('offers to start active workouts instead of switching them off', async () => {
    mockWorkouts([testWorkout(5, { type: 'pull' })]);
    await render(<WorkoutsScreen />);
    expect(screen.queryByLabelText('Pull is active')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
    expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  describe('with a workout in progress', () => {
    beforeEach(() => {
      jest
        .mocked(useActiveSession)
        .mockReturnValue({ ...RUNNING, startedAt: Date.now() - 23 * 60_000 });
      mockWorkouts([testWorkout(4, { type: 'push' }), testWorkout(5, { type: 'pull' })]);
    });

    it('shows it at the top and opens it again', async () => {
      await render(<WorkoutsScreen />);
      expect(screen.getByText('IN PROGRESS')).toBeTruthy();
      expect(screen.getByText('23:00')).toBeTruthy();
      expect(screen.getByText('Running')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Start Push' })).toBeNull();
      await fireEvent.press(screen.getByRole('button', { name: 'IN PROGRESS: Push' }));
      expect(router.push).toHaveBeenCalledWith('/session');
    });

    it('asks before starting another one', async () => {
      await render(<WorkoutsScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
      expect(startWorkout).not.toHaveBeenCalled();
      expect(screen.getByText('Push is still running')).toBeTruthy();
      expect(
        screen.getByText(
          'You started it 23 minutes ago and logged 1 set. Only one workout can run at a time.',
        ),
      ).toBeTruthy();

      await fireEvent.press(screen.getByRole('button', { name: 'Finish Push, then start Pull' }));
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/session/finish',
        params: { next: '5' },
      });

      await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Discard Push and start Pull' }));
      // The running workout ends only once Pull is sure to start, after any question about it.
      expect(endSession).not.toHaveBeenCalled();
      // It starts once the sheet has closed, as iOS cannot open the question before.
      await waitFor(() =>
        expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), {
          beforeStart: endSession,
        }),
      );
    });

    it('goes back to it from the question', async () => {
      await render(<WorkoutsScreen />);
      await fireEvent.press(screen.getByRole('button', { name: 'Start Pull' }));
      await act(async () => {
        await fireEvent.press(screen.getByRole('button', { name: 'Resume Push' }));
      });
      expect(router.push).toHaveBeenCalledWith('/session');
    });
  });

  it('shows an error with a retry', async () => {
    mockWorkouts(undefined, { isError: true });
    await render(<WorkoutsScreen />);
    expect(screen.getByText("This couldn't load")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a spinner while loading', async () => {
    mockWorkouts(undefined);
    await render(<WorkoutsScreen />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('ArchiveScreen', () => {
  it('lists only the inactive workouts, which can be switched on', async () => {
    mockWorkouts([
      testWorkout(1, { type: 'push' }),
      testWorkout(2, { type: 'upper', active: false }),
    ]);
    await render(<ArchiveScreen />);
    expect(screen.queryByText('Push')).toBeNull();
    // Inactive workouts cannot be started.
    expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
    await fireEvent(screen.getByLabelText('Upper body is active'), 'valueChange', true);
    expect(mutate).toHaveBeenCalledWith({ id: 2, active: true });
  });

  it('says when the archive is empty, and goes back', async () => {
    mockWorkouts([testWorkout(1)]);
    await render(<ArchiveScreen />);
    expect(screen.getByText('No archived workouts.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });
});

describe('WorkoutScreen', () => {
  const pull = testWorkout(7, {
    type: 'pull',
    weekdays: [3],
    estimatedMinutes: 50,
    exercises: [
      testExercise('pulldown', { primaryMuscles: ['lats'] }),
      testExercise('row', { sets: 4, primaryMuscles: ['middle back', 'lats'], restSeconds: 75 }),
      testExercise('curl', {
        sets: 2,
        primaryMuscles: ['biceps'],
        target: { reps: { min: 10, max: 10 } },
      }),
      testExercise('rope', {
        target: { seconds: 45, meters: null },
        restSeconds: 30,
        primaryMuscles: ['calves'],
      }),
    ],
  });

  it('shows the workout with its days, muscles and size', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    expect(screen.getByText('Pull')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText('Lats · Middle back · Biceps')).toBeTruthy();
    // The rope's conditioning counts like any exercise.
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('exercises')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('sets')).toBeTruthy();
    expect(screen.getByText('~50')).toBeTruthy();
  });

  it('lists each exercise with its name, target and rest', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await waitFor(() => expect(screen.getByText('Name of pulldown')).toBeTruthy());
    expect(screen.getByText('4 × 8–12 reps')).toBeTruthy();
    expect(screen.getByText('Rest 1:15')).toBeTruthy();
    expect(screen.getByText('2 × 10 reps')).toBeTruthy();
    expect(screen.getByText('Name of rope')).toBeTruthy();
    expect(screen.getByText('3 × 45 s')).toBeTruthy();
    expect(screen.getByText('Rest 0:30')).toBeTruthy();
  });

  it('shows the exercise pictures', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    const sources = screen.container
      .queryAll((node) => node.type === 'Image')
      .map((node) => node.props.source?.uri);
    expect(sources).toContain('https://images.test/pulldown/0.webp');
    expect(sources).toContain('https://images.test/rope/0.webp');
  });

  it('opens the editor and each exercise’s details', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/edit', params: { id: '7' } });
    await waitFor(() => expect(screen.getByText('Name of row')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Details of Name of row' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/[id]',
      params: { id: 'row' },
    });
  });

  it('starts the workout, or resumes it while it runs', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
    expect(startWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));

    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('asks before deleting the workout, and not while it runs', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(alert.mock.calls[0]?.[0]).toBe('Delete this workout?');

    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(alert.mock.calls[1]?.[0]).toBe('Pull is running');
  });

  it('cannot be edited while it is running, and goes back to it instead', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.mocked(useActiveSession).mockReturnValue({ ...RUNNING, workoutId: 7 });
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]?.slice(0, 2)).toEqual([
      'Pull is running',
      'Finish the workout before changing it.',
    ]);
    const resume = alert.mock.calls[0]?.[2]?.find(
      (button) => button.text === 'Back to the workout',
    );
    resume?.onPress?.();
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('moves the workout to the archive, and back', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Move to archive' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, active: false });

    mockWorkouts([{ ...pull, active: false }]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bring back from the archive' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, active: true });
  });

  it('says when the workout does not exist', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});
