import { router } from 'expo-router';

import { setCreatedExercise } from '@/exercises/custom';
import { useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { fireEvent, render, screen } from '@/test/render';

import { addExercises, useDraft } from './draft';
import { PickerScreen } from './picker-screen';
import { useWorkoutLimits } from './workouts';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { back: jest.fn(), push: jest.fn() },
    // Runs as the screen shows, as when coming back to it.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('@/exercises/library', () => ({
  ...jest.requireActual<typeof import('@/exercises/library')>('@/exercises/library'),
  useExerciseLibrary: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./draft', () => ({ addExercises: jest.fn(), useDraft: jest.fn() }));
jest.mock('./workouts', () => ({
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
  useWorkoutLimits: jest.fn(),
}));

const exercise = (
  id: string,
  name: string,
  more: Partial<LibraryExercise> = {},
): LibraryExercise => ({
  id,
  name,
  searchText: name.toLowerCase(),
  metrics: ['weight', 'reps'],
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: 'barbell',
  level: 'beginner',
  category: 'strength',
  imagePaths: [`${id}/0.webp`],
  custom: false,
  archived: false,
  ...more,
});

const BENCH = exercise('bench', 'Bench press');
const PULLDOWN = exercise('pulldown', 'Lat pulldown', {
  primaryMuscles: ['lats'],
  equipment: 'cable',
});
const ROWING = exercise('rowing', 'Rowing', { primaryMuscles: ['quadriceps'], category: 'cardio' });

const loaded = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useExerciseLibrary).mockReturnValue(loaded([BENCH, PULLDOWN, ROWING]) as never);
  jest.mocked(useWorkoutLimits).mockReturnValue(loaded({ exercises: 10, workouts: 5 }) as never);
  jest.mocked(useDraft).mockReturnValue({ name: '', weekdays: [], exercises: [] });
});

describe('PickerScreen', () => {
  it('lists the library with each exercise’s muscle and equipment', async () => {
    await render(<PickerScreen />);
    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('Chest · Barbell')).toBeTruthy();
    expect(screen.getByText('Lats · Cable')).toBeTruthy();
  });

  it('searches by name', async () => {
    await render(<PickerScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'lat');
    expect(screen.getByText('Lat pulldown')).toBeTruthy();
    expect(screen.queryByText('Bench press')).toBeNull();
  });

  it('filters by muscle group and cardio, and says when nothing is found', async () => {
    await render(<PickerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Lat pulldown')).toBeTruthy();
    expect(screen.queryByText('Bench press')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Cardio' }));
    expect(screen.getByText('Rowing')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'bench');
    // Nothing found by a name offers to create it.
    expect(screen.getByText('No exercise found')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create “bench”' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/new',
      params: { name: 'bench' },
    });
  });

  it('adds the chosen exercises in the order they were chosen', async () => {
    await render(<PickerScreen />);
    expect(screen.getByRole('button', { name: 'Add exercises' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Lat pulldown' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bench press' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Rowing' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Rowing' }));
    expect(screen.getByRole('checkbox', { name: 'Bench press' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Add 2 exercises' }));
    expect(addExercises).toHaveBeenCalledWith([PULLDOWN, BENCH]);
    expect(router.back).toHaveBeenCalled();
  });

  it('stops choosing when the workout is full', async () => {
    jest.mocked(useWorkoutLimits).mockReturnValue(loaded({ exercises: 2, workouts: 5 }) as never);
    jest.mocked(useDraft).mockReturnValue({
      name: 'Push',
      weekdays: [],
      exercises: [
        {
          key: '1',
          exerciseId: 'dip',
          sets: 3,
          target: { reps: { min: 8, max: 12 } },
          restSeconds: 90,
        },
      ],
    });
    await render(<PickerScreen />);
    expect(screen.queryByText('Workouts can have up to 2 exercises.')).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bench press' }));
    expect(screen.getByText('Workouts can have up to 2 exercises.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Rowing' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bench press' }));
    expect(screen.getByRole('checkbox', { name: 'Rowing' })).toBeEnabled();
  });

  it('opens an exercise’s details', async () => {
    await render(<PickerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Details of Bench press' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/[id]',
      params: { id: 'bench' },
    });
  });

  it('chooses an exercise just created on coming back', async () => {
    setCreatedExercise(exercise('hip', 'Hip thrust', { custom: true }));
    await render(<PickerScreen />);
    expect(screen.getByRole('button', { name: 'Add 1 exercise' })).toBeTruthy();
  });

  it("creates an exercise and filters the user's own", async () => {
    jest
      .mocked(useExerciseLibrary)
      .mockReturnValue(
        loaded([BENCH, exercise('hip', 'Hip thrust', { custom: true, imagePaths: [] })]) as never,
      );
    await render(<PickerScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create exercise' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workout/exercise/new', params: {} });
    expect(screen.getByText('Mine · Chest · Barbell')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Mine' }));
    expect(screen.queryByText('Bench press')).toBeNull();
    expect(screen.getByText('Hip thrust')).toBeTruthy();
  });
});
