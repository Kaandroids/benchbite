import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { act, fireEvent, render, screen } from '@/test/render';

import { addExercises, clearDraft } from './draft';
import { EditorScreen } from './editor-screen';
import { testExercise, testWorkout } from './test-data';
import { useDeleteWorkout, useWorkoutLimits, useSaveWorkout, useWorkouts } from './workouts';

jest.mock('@/exercises/images', () => ({
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), dismiss: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
/** Resolves last time's sets when a test lets it, at once otherwise. */
let mockLastSetsGate: Promise<void> = Promise.resolve();
jest.mock('@/sessions/logs', () => ({
  fetchLastSetsOrNone: async () => {
    await mockLastSetsGate;
    return {
      bench: [
        { weightKg: 75, reps: 12, seconds: null, meters: null },
        { weightKg: 80, reps: 10, seconds: null, meters: null },
      ],
    };
  },
}));
jest.mock('./workouts', () => ({
  ...jest.requireActual<typeof import('./workouts')>('./workouts'),
  useWorkouts: jest.fn(),
  useSaveWorkout: jest.fn(),
  useDeleteWorkout: jest.fn(),
  useWorkoutLimits: jest.fn(),
}));

const libraryExercise = (
  id: string,
  name: string,
  metrics: LibraryExercise['metrics'],
): LibraryExercise => ({
  id,
  name,
  searchText: name.toLowerCase(),
  metrics,
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  imagePaths: [`${id}/0.webp`],
  custom: false,
  archived: false,
});

const LIBRARY = [
  libraryExercise('bench', 'Bench press', ['weight', 'reps']),
  libraryExercise('rowing', 'Rowing', ['distance', 'duration']),
  libraryExercise('plank', 'Plank', ['duration']),
];

const PUSH = testWorkout(5, {
  type: 'push',
  weekdays: [1],
  exercises: [
    testExercise('bench', { sets: 4, restSeconds: 120 }),
    testExercise('rowing', { target: { seconds: 300, meters: null }, restSeconds: 0, sets: 1 }),
  ],
});

const saveWorkout = jest.fn();
const deleteWorkout = jest.fn();
const loaded = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useWorkouts).mockReturnValue(loaded([PUSH]) as never);
  jest.mocked(useExerciseLibrary).mockReturnValue(loaded(LIBRARY) as never);
  jest.mocked(useWorkoutLimits).mockReturnValue(loaded({ exercises: 10, workouts: 5 }) as never);
  jest.mocked(useSaveWorkout).mockReturnValue({
    mutateAsync: saveWorkout.mockResolvedValue(5),
    isPending: false,
    isError: false,
  } as never);
  jest.mocked(useDeleteWorkout).mockReturnValue({
    mutateAsync: deleteWorkout.mockResolvedValue(undefined),
  } as never);
});
afterEach(() => clearDraft());

describe('EditorScreen', () => {
  it('keeps the changes when loading again fails and is tried again', async () => {
    const { rerender } = await render(<EditorScreen id={5} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Chest day');
    jest
      .mocked(useWorkoutLimits)
      .mockReturnValue({ ...loaded({ exercises: 10, workouts: 5 }), isError: true } as never);
    await rerender(<EditorScreen id={5} />);
    jest.mocked(useWorkoutLimits).mockReturnValue(loaded({ exercises: 10, workouts: 5 }) as never);
    await rerender(<EditorScreen id={5} />);
    expect(screen.getByLabelText('Name').props.value).toBe('Chest day');
  });

  it('starts a new workout empty, and saves only with a name and an exercise', async () => {
    await render(<EditorScreen />);
    expect(screen.getByRole('header', { name: 'New workout' })).toHaveStyle({ fontSize: 20 });
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Arms');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await act(() => addExercises([LIBRARY[0]!]));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.queryByText('Delete workout')).toBeNull();
  });

  it('loads a workout with its exercises', async () => {
    await render(<EditorScreen id={5} />);
    expect(screen.getByText('Edit workout')).toBeTruthy();
    // The type names the workout until it gets a name of its own.
    expect(screen.getByLabelText('Name').props.value).toBe('');
    expect(screen.getByLabelText('Name').props.placeholder).toBe('Push');
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).not.toBeChecked();
    expect(screen.getByText('Exercises · 2')).toBeTruthy();
    expect(screen.getByText('4 × 8–12 reps')).toBeTruthy();
    expect(screen.getByText('1 × 5 min')).toBeTruthy();
  });

  it('keeps the type as the name of an unnamed workout', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkout).toHaveBeenCalledWith(expect.objectContaining({ id: 5, name: null }));
  });

  it('says when the workout does not exist', async () => {
    await render(<EditorScreen id={99} />);
    expect(screen.getByText('Workout not found')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the name, days and exercises, then goes back', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.changeText(screen.getByLabelText('Name'), '  Chest day ');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Thursday' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Monday' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkout).toHaveBeenCalledWith({
      id: 5,
      name: 'Chest day',
      weekdays: [4],
      exercises: [
        {
          exerciseId: 'bench',
          sets: 4,
          target: { reps: { min: 8, max: 12 } },
          restSeconds: 120,
          superset: null,
          setTargets: null,
        },
        {
          exerciseId: 'rowing',
          sets: 1,
          target: { seconds: 300, meters: null },
          restSeconds: 0,
          superset: null,
          setTargets: null,
        },
      ],
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('joins an exercise with the next into a superset, which shares its rest', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bench press' }));
    expect(screen.getByText('Rowing, with no rest between them')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Superset with the next exercise'), 'valueChange', true);
    expect(screen.getByText('Rest after the round')).toBeTruthy();
    expect(screen.getAllByText('Superset · Rest 2:00')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({ exerciseId: 'bench', superset: 1, restSeconds: 120 }),
          expect.objectContaining({ exerciseId: 'rowing', superset: 1, restSeconds: 120 }),
        ],
      }),
    );
  });

  it('splits up a superset left with one exercise by a removal', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bench press' }));
    await fireEvent(screen.getByLabelText('Superset with the next exercise'), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [expect.objectContaining({ exerciseId: 'rowing', superset: null })],
      }),
    );
  });

  it('offers no superset with the next for the last exercise', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Rowing' }));
    expect(screen.queryByLabelText('Superset with the next exercise')).toBeNull();
    expect(screen.getByText('Rest')).toBeTruthy();
  });

  it('adds targets from last time, changes one in a sheet of its own and saves them', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bench press' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Add targets/ }));
    expect(await screen.findByRole('button', { name: 'Set 1, 75 kg × 8' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Set 2, 80 kg × 8' })).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Set 2, 80 kg × 8' }));
    expect(await screen.findByText('Set 2 target')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'More: Weight' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Less: Reps' }));
    // The set's sheet is inside the exercise's, before its own buttons.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Done' })[0]!);
    expect(screen.getByRole('button', { name: 'Set 2, 82.5 kg × 7' })).toBeTruthy();
    // One set fewer drops its target.
    await fireEvent.press(screen.getByRole('button', { name: 'Less: Sets' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({
            exerciseId: 'bench',
            sets: 3,
            setTargets: [
              { weightKg: 75, reps: 8, seconds: null },
              { weightKg: 82.5, reps: 7, seconds: null },
              { weightKg: 80, reps: 8, seconds: null },
            ],
          }),
          expect.objectContaining({ exerciseId: 'rowing', setTargets: null }),
        ],
      }),
    );
  });

  it('keeps a change made while last time’s sets load', async () => {
    let release = () => {};
    mockLastSetsGate = new Promise((resolve) => {
      release = resolve;
    });
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bench press' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Add targets/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'More: Sets' }));
    await act(async () => release());
    mockLastSetsGate = Promise.resolve();
    expect(await screen.findByRole('button', { name: 'Set 5, 80 kg × 8' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(saveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({ exerciseId: 'bench', sets: 5, setTargets: expect.any(Array) }),
          expect.anything(),
        ],
      }),
    );
    expect(saveWorkout.mock.calls[0][0].exercises[0].setTargets).toHaveLength(5);
  });

  it('keeps a set target unchanged when its sheet is cancelled, and clears them all', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Bench press' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Add targets/ }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Set 1, 75 kg × 8' }));
    await screen.findByText('Set 1 target');
    await fireEvent.press(screen.getByRole('button', { name: 'More: Reps' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Set 1, 75 kg × 8' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear targets' }));
    expect(screen.getByRole('button', { name: /^Add targets/ })).toBeTruthy();
  });

  it('offers no targets for a distance', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Rowing' }));
    expect(screen.queryByRole('button', { name: /^Add targets/ })).toBeNull();
  });

  it('opens the picker to add exercises', async () => {
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercises' }));
    expect(router.push).toHaveBeenCalledWith('/workout/pick');
  });

  it('stops adding exercises at the limit', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue(loaded({ exercises: 2, workouts: 5 }) as never);
    await render(<EditorScreen id={5} />);
    expect(screen.queryByRole('button', { name: 'Add exercises' })).toBeNull();
    expect(screen.getByText('Workouts can have up to 2 exercises.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('asks to remove exercises above the limit before saving', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue(loaded({ exercises: 1, workouts: 5 }) as never);
    await render(<EditorScreen id={5} />);
    expect(screen.getByText('Remove 1 exercise to save. Workouts can have up to 1.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says why a workout was not saved', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    saveWorkout
      .mockRejectedValueOnce({ code: 'BB008' })
      .mockRejectedValueOnce(new Error('offline'));
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(alert).toHaveBeenLastCalledWith('Not saved', 'Workouts can have up to 10 exercises.');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(alert).toHaveBeenLastCalledWith(
      'Not saved',
      "We couldn't save the workout. Check your connection and try again.",
    );
    saveWorkout.mockRejectedValueOnce({ code: 'BB009' });
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(alert).toHaveBeenLastCalledWith(
      'Not saved',
      'You can have up to 5 workouts. Delete one to make room.',
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('deletes the workout after asking', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    expect(deleteWorkout).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    const confirm = buttons.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    expect(deleteWorkout).toHaveBeenCalledWith(5);
    expect(router.dismiss).toHaveBeenCalledWith(2);
  });

  it('says when the delete failed, and stays open', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    deleteWorkout.mockRejectedValueOnce(new Error('offline'));
    await render(<EditorScreen id={5} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete workout' }));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    const confirm = buttons.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());
    expect(alert.mock.lastCall?.[0]).toBe('Not deleted');
    expect(router.dismiss).not.toHaveBeenCalled();
  });

  describe('the exercise sheet', () => {
    const open = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
    const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

    it('changes the sets, reps and rest', async () => {
      await render(<EditorScreen id={5} />);
      await open('Bench press');
      await press('More: Sets');
      await press('More: Reps from');
      await press('Less: Reps to');
      await press('More: Rest');
      await press('Done');
      expect(screen.getByText('5 × 9–11 reps')).toBeTruthy();
      expect(screen.getByText('Rest 2:15')).toBeTruthy();
    });

    it('keeps the rep range in order', async () => {
      await render(<EditorScreen id={5} />);
      await open('Bench press');
      for (let i = 0; i < 5; i++) {
        await press('More: Reps from');
      }
      expect(screen.getByLabelText('Reps from 13')).toBeTruthy();
      expect(screen.getByLabelText('Reps to 13')).toBeTruthy();
    });

    it('sets a distance, a time or both, never neither', async () => {
      await render(<EditorScreen id={5} />);
      await open('Rowing');
      expect(screen.getByLabelText('Distance –')).toBeTruthy();
      // Without a distance, the time stops at its shortest instead of turning off.
      for (let i = 0; i < 25; i++) {
        await press('Less: Time');
      }
      expect(screen.getByLabelText('Time 0:05')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Less: Time' })).toBeDisabled();
      await press('More: Distance');
      expect(screen.getByLabelText('Distance 100 m')).toBeTruthy();
      await press('Less: Time');
      expect(screen.getByLabelText('Time –')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Less: Distance' })).toBeDisabled();
      await press('Done');
      expect(screen.getByText('1 × 100 m')).toBeTruthy();
    });

    it('removes the exercise', async () => {
      await render(<EditorScreen id={5} />);
      await open('Bench press');
      await press('Remove');
      expect(screen.getByText('Exercises · 1')).toBeTruthy();
    });
  });
});
