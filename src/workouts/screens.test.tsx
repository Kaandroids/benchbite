import { router } from 'expo-router';

import { fireEvent, render, screen, waitFor } from '@/test/render';

import { ArchiveScreen } from './archive-screen';
import { testExercise, testWorkout } from './test-data';
import { WorkoutScreen } from './workout-screen';
import { useSetWorkoutActive, useWorkouts, type Workout } from './workouts';
import { WorkoutsScreen } from './workouts-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkouts: jest.fn(),
  useSetWorkoutActive: jest.fn(),
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) =>
          Promise.resolve({
            data: ids.map((id) => ({ id, name: `Name of ${id}`, exercise_translations: [] })),
          }),
      }),
    }),
  },
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: WEDNESDAY, advanceTimers: true });
  jest.mocked(useSetWorkoutActive).mockReturnValue({ mutate } as never);
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
    expect(screen.getAllByText('1 exercise · about 45 min')).toHaveLength(3);
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

  it('switches a workout off', async () => {
    mockWorkouts([testWorkout(5, { type: 'pull' })]);
    await render(<WorkoutsScreen />);
    await fireEvent(screen.getByLabelText('Pull is active'), 'valueChange', false);
    expect(mutate).toHaveBeenCalledWith({ id: 5, active: false });
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
    ],
    finisher: testExercise('rope', {
      target: { seconds: 45, meters: null },
      restSeconds: 30,
      primaryMuscles: ['calves'],
    }),
  });

  it('shows the workout with its days, muscles and size', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    expect(screen.getByText('Pull')).toBeTruthy();
    expect(screen.getByText('Wed')).toBeTruthy();
    expect(screen.getByText('Lats · Middle back · Biceps')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('exercises')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByText('sets')).toBeTruthy();
    expect(screen.getByText('~50')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('lists each exercise with its name, target and rest, and the finisher', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await waitFor(() => expect(screen.getByText('Name of pulldown')).toBeTruthy());
    expect(screen.getByText('4 × 8–12 reps')).toBeTruthy();
    expect(screen.getByText('Rest 1:15')).toBeTruthy();
    expect(screen.getByText('2 × 10 reps')).toBeTruthy();
    expect(screen.getByText('Finisher')).toBeTruthy();
    expect(screen.getByText('Name of rope')).toBeTruthy();
    expect(screen.getByText('3 × 45 s')).toBeTruthy();
    expect(screen.getByText('Rest 0:30')).toBeTruthy();
  });

  it('leaves the pictures to the exercise details', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    expect(screen.container.queryAll((node) => node.type === 'Image')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Details of Name of rope' })).toBeTruthy();
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

  it('switches the workout off', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={7} />);
    await fireEvent(screen.getByLabelText('Pull is active'), 'valueChange', false);
    expect(mutate).toHaveBeenCalledWith({ id: 7, active: false });
  });

  it('says when the workout does not exist', async () => {
    mockWorkouts([pull]);
    await render(<WorkoutScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
  });
});
